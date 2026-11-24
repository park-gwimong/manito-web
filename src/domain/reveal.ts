import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  assignments,
  events,
  guesses,
  missionDeliveries,
  participants,
  records,
  secretDeeds,
  verdicts,
} from "@/db/schema";
import { DomainError } from "./errors";
import { advanceEvent } from "./lifecycle";
import { finalScores, temperature, type FinalScore } from "./scoring";

export type RevealData = {
  summary: { temperature: number; recordCount: number; missionsCompleted: number };
  chain: {
    receiver: { id: string; name: string };
    giver: { id: string; name: string };
    records: { body: string; createdAt: Date; result: boolean | null }[];
    unnoticedDeeds: { body: string; createdAt: Date }[];
    guess: { name: string; correct: boolean } | null;
  }[];
  scores: { id: string; name: string; score: FinalScore }[];
  awards: {
    nunchi: string[];
    heotdari: string[];
    shadow: string[];
    mission: string[];
  };
};

async function loadParticipant(db: Db, participantId: string) {
  const [p] = await db.select().from(participants).where(eq(participants.id, participantId));
  if (!p) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  return p;
}

/** 마감 후 발표가 시작되기 전까지만 마니또를 추측할 수 있다. 다시 고르면 덮어쓴다. */
export async function setGuess(db: Db, participantId: string, guessedId: string, now: Date): Promise<void> {
  const me = await loadParticipant(db, participantId);
  await advanceEvent(db, me.eventId, now);

  await db.transaction(async (tx) => {
    // 이벤트 행을 잠가, 동시에 발표가 시작되는 경우와 순서가 갈리게 한다.
    const [event] = await tx.select().from(events).where(eq(events.id, me.eventId)).for("update");
    if (event.status !== "closed" || event.presentationStartedAt !== null) {
      throw new DomainError("GUESS_CLOSED", "마니또 추측은 마감 후 발표가 시작되기 전까지만 할 수 있어요.");
    }
    const [target] = await tx.select().from(participants).where(eq(participants.id, guessedId));
    if (!target || target.eventId !== me.eventId || target.id === me.id) {
      throw new DomainError("INVALID_GUESS", "추측할 수 없는 사람이에요.");
    }
    await tx
      .insert(guesses)
      .values({ participantId, guessedId })
      .onConflictDoUpdate({ target: guesses.participantId, set: { guessedId } });
  });
}

export async function getMyGuess(db: Db, participantId: string): Promise<string | null> {
  const [row] = await db.select().from(guesses).where(eq(guesses.participantId, participantId));
  return row?.guessedId ?? null;
}

async function requireOrganizer(db: Db, organizerId: string, now: Date) {
  const me = await loadParticipant(db, organizerId);
  await advanceEvent(db, me.eventId, now);
  if (!me.isOrganizer) throw new DomainError("NOT_ORGANIZER", "개설자만 할 수 있어요.");
  return me;
}

export async function startPresentation(db: Db, organizerId: string, now: Date): Promise<void> {
  const me = await requireOrganizer(db, organizerId, now);
  const updated = await db
    .update(events)
    .set({ presentationStartedAt: now })
    .where(and(eq(events.id, me.eventId), eq(events.status, "closed"), isNull(events.presentationStartedAt)))
    .returning({ id: events.id });
  if (updated.length === 0) {
    throw new DomainError("NOT_CLOSED", "마감된 모임에서만 발표를 시작할 수 있어요.");
  }
}

export async function finishPresentation(db: Db, organizerId: string, now: Date): Promise<void> {
  const me = await requireOrganizer(db, organizerId, now);
  const updated = await db
    .update(events)
    .set({ status: "revealed" })
    .where(
      and(eq(events.id, me.eventId), eq(events.status, "closed"), isNotNull(events.presentationStartedAt)),
    )
    .returning({ id: events.id });
  if (updated.length === 0) {
    throw new DomainError("NOT_PRESENTING", "발표 중일 때만 발표를 끝낼 수 있어요.");
  }
}

function topNames(counts: Map<string, number>, nameOf: Map<string, string>): string[] {
  const max = Math.max(0, ...counts.values());
  if (max === 0) return [];
  return [...counts.entries()]
    .filter(([, n]) => n === max)
    .map(([id]) => nameOf.get(id)!)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * 최종 점수·배정·판정·몰래 한 일이 도메인 밖으로 나가는 유일한 경로.
 * 공개 조건을 만족하기 전에는 비밀 데이터를 조회하지 않는다.
 */
export async function getRevealData(db: Db, eventId: string, viewerId: string): Promise<RevealData> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new DomainError("EVENT_NOT_FOUND", "모임을 찾을 수 없어요.");
  const [viewer] = await db.select().from(participants).where(eq(participants.id, viewerId));
  const entitled =
    viewer !== undefined &&
    viewer.eventId === eventId &&
    (event.status === "revealed" ||
      (event.status === "closed" && viewer.isOrganizer && event.presentationStartedAt !== null));
  if (!entitled) throw new DomainError("NOT_REVEALED", "아직 결과가 공개되지 않았어요.");

  const members = await db
    .select()
    .from(participants)
    .where(eq(participants.eventId, eventId))
    .orderBy(asc(participants.createdAt), asc(participants.id));
  const nameOf = new Map(members.map((m) => [m.id, m.name]));

  const [assignmentRows, recordRows, deedRows, guessRows, missionRows, scoreMap, temp] = await Promise.all([
    db.select().from(assignments).where(eq(assignments.eventId, eventId)),
    db
      .select({
        authorId: records.authorId,
        body: records.body,
        createdAt: records.createdAt,
        id: records.id,
        isMine: verdicts.isMine,
      })
      .from(records)
      .leftJoin(verdicts, eq(verdicts.recordId, records.id))
      .where(eq(records.eventId, eventId))
      .orderBy(asc(records.createdAt), asc(records.id)),
    db
      .select()
      .from(secretDeeds)
      .where(eq(secretDeeds.eventId, eventId))
      .orderBy(asc(secretDeeds.createdAt), asc(secretDeeds.id)),
    db.select().from(guesses),
    db
      .select({ participantId: missionDeliveries.participantId })
      .from(missionDeliveries)
      .where(and(eq(missionDeliveries.eventId, eventId), isNotNull(missionDeliveries.completedAt))),
    finalScores(db, eventId),
    temperature(db, event),
  ]);

  const giverOf = new Map(assignmentRows.map((a) => [a.receiverId, a.giverId]));
  const guessOf = new Map(guessRows.filter((g) => nameOf.has(g.participantId)).map((g) => [g.participantId, g.guessedId]));

  const chain: RevealData["chain"] = [];
  const seen = new Set<string>();
  let receiverId: string | undefined = members[0]?.id;
  while (receiverId && !seen.has(receiverId)) {
    seen.add(receiverId);
    const giverId = giverOf.get(receiverId);
    if (!giverId) break;
    const guessedId = guessOf.get(receiverId);
    chain.push({
      receiver: { id: receiverId, name: nameOf.get(receiverId)! },
      giver: { id: giverId, name: nameOf.get(giverId)! },
      records: recordRows
        .filter((r) => r.authorId === receiverId)
        .map((r) => ({ body: r.body, createdAt: r.createdAt, result: r.isMine })),
      unnoticedDeeds: deedRows
        .filter((d) => d.giverId === giverId)
        .map((d) => ({ body: d.body, createdAt: d.createdAt })),
      guess:
        guessedId === undefined
          ? null
          : { name: nameOf.get(guessedId) ?? "", correct: guessedId === giverId },
    });
    receiverId = giverId;
  }

  const scores = members
    .map((m) => ({ id: m.id, name: m.name, score: scoreMap.get(m.id)! }))
    .sort((a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name));

  const tally = (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };

  return {
    summary: { temperature: temp, recordCount: recordRows.length, missionsCompleted: missionRows.length },
    chain,
    scores,
    awards: {
      nunchi: topNames(tally(recordRows.filter((r) => r.isMine === true).map((r) => r.authorId)), nameOf),
      heotdari: topNames(tally(recordRows.filter((r) => r.isMine === false).map((r) => r.authorId)), nameOf),
      shadow: topNames(tally(deedRows.map((d) => d.giverId)), nameOf),
      mission: topNames(tally(missionRows.map((r) => r.participantId)), nameOf),
    },
  };
}
