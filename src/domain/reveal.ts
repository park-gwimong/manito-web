import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  assignments,
  events,
  guesses,
  missionDeliveries,
  missionTemplates,
  participants,
  records,
  secretDeeds,
  verdicts,
} from "@/db/schema";
import { decideAwards, type AwardStats } from "./awards";
import { DomainError } from "./errors";
import { advanceEvent } from "./lifecycle";
import { enqueue } from "./notifications";
import { finalScores, temperature, type FinalScore } from "./scoring";

export type RevealData = {
  summary: { temperature: number; recordCount: number; missionsCompleted: number };
  /**
   * 한 사람씩 공개하는 순서. 배정 고리를 따라간다(A의 마니또가 B면 다음은 B의 마니또).
   * 점수와 무관하다. 선물을 나누는 모임은 공개되는 순서대로 고르면 된다.
   */
  chain: {
    receiver: { id: string; name: string };
    giver: { id: string; name: string };
    records: { body: string; createdAt: Date; result: boolean | null }[];
    unnoticedDeeds: { body: string; createdAt: Date }[];
    guess: { name: string; correct: boolean } | null;
  }[];
  scores: { id: string; name: string; score: FinalScore }[];
  /**
   * 이 이벤트의 미션 목록 전체. 진행 중에는 참가자가 자기에게 온 미션만 보므로, 목록은 여기서 처음 공개된다.
   * 해낸 사람만 싣는다. 받고도 못 한 사람은 드러내지 않는다. 해낸 사람이 많은 순.
   */
  missions: { body: string; completedBy: string[] }[];
  /** 부문마다 수상자는 한 명(해당자가 없으면 빈 배열). 동점을 가리는 순서는 `awards.ts`에 있다. */
  awards: {
    nunchi: string[];
    heotdari: string[];
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

/** 아직 마니또를 추측하지 않은 참가자 수. 누구인지는 내보내지 않는다. */
export async function countUnguessed(db: Db, eventId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(participants)
    .leftJoin(guesses, eq(guesses.participantId, participants.id))
    .where(and(eq(participants.eventId, eventId), isNull(guesses.participantId)));
  return row?.n ?? 0;
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
  const members = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.eventId, me.eventId));
  await enqueue(
    db,
    me.eventId,
    members.filter((m) => m.id !== me.id).map((m) => m.id),
    "presentation",
  );
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

  const [assignmentRows, recordRows, deedRows, guessRows, deliveryRows, templateRows, scoreMap, temp] = await Promise.all([
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
      .select({
        participantId: missionDeliveries.participantId,
        body: missionDeliveries.body,
        completedAt: missionDeliveries.completedAt,
      })
      .from(missionDeliveries)
      .where(eq(missionDeliveries.eventId, eventId)),
    db
      .select({ body: missionTemplates.body })
      .from(missionTemplates)
      .where(eq(missionTemplates.eventId, eventId))
      .orderBy(asc(missionTemplates.id)),
    finalScores(db, eventId),
    temperature(db, event),
  ]);

  const missionRows = deliveryRows.filter((d) => d.completedAt !== null);
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

  // 시상에 쓰는 사람별 집계. 참가한 순서대로 넘긴다.
  const lastTime = (dates: Date[]) => (dates.length > 0 ? Math.max(...dates.map((d) => d.getTime())) : null);
  const awardStats: AwardStats[] = members.map((m) => {
    const mine = recordRows.filter((r) => r.authorId === m.id);
    const hits = mine.filter((r) => r.isMine === true);
    const misses = mine.filter((r) => r.isMine === false);
    const delivered = deliveryRows.filter((d) => d.participantId === m.id);
    const done = delivered.filter((d) => d.completedAt !== null);
    return {
      id: m.id,
      hits: hits.length,
      lastHitAt: lastTime(hits.map((r) => r.createdAt)),
      misses: misses.length,
      lastMissAt: lastTime(misses.map((r) => r.createdAt)),
      guessedRight: guessOf.has(m.id) && guessOf.get(m.id) === giverOf.get(m.id),
      missionsDelivered: delivered.length,
      missionsDone: done.length,
      lastMissionAt: lastTime(done.map((d) => d.completedAt!)),
    };
  });
  const winners = decideAwards(awardStats);
  const winnerName = (id: string | null) => (id ? [nameOf.get(id)!] : []);

  // 미션은 본문으로 묶는다(배달된 미션은 목록의 본문을 복사해 둔 것이다).
  const doneBy = new Map<string, string[]>();
  // 완료한 배달에는 본문이 반드시 있다(고르지 않으면 완료할 수 없다).
  for (const body of new Set([...templateRows.map((t) => t.body), ...missionRows.map((m) => m.body!)])) {
    doneBy.set(body, []);
  }
  for (const m of missionRows) doneBy.get(m.body!)!.push(nameOf.get(m.participantId) ?? "");
  const missions = [...doneBy]
    .map(([body, names]) => ({ body, completedBy: names.filter(Boolean).sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.completedBy.length - a.completedBy.length);

  return {
    summary: { temperature: temp, recordCount: recordRows.length, missionsCompleted: missionRows.length },
    chain,
    scores,
    missions,
    awards: {
      nunchi: winnerName(winners.nunchi),
      heotdari: winnerName(winners.heotdari),
      mission: winnerName(winners.mission),
    },
  };
}
