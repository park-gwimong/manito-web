import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  assignments,
  events,
  missionDeliveries,
  participants,
  reactions,
  records,
  secretDeeds,
  verdicts,
  type Event,
} from "@/db/schema";
import { MIN_PARTICIPANTS } from "./constants";
import { getTargetOf } from "./lifecycle";
import { kstDayKey, liveLines, temperature, type ScoreLine } from "./scoring";

export type FeedItem = {
  id: string;
  author: { id: string; name: string };
  body: string;
  createdAt: Date;
  isMine: boolean;
  verdictStatus: "pending" | "done";
  judge?: { myVerdict: boolean | null };
  result?: boolean | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export type Lobby = {
  participants: { id: string; name: string; isOrganizer: boolean }[];
  startMissed: boolean;
  minParticipants: number;
};

export type Duty = {
  target: { id: string; name: string };
  /** 진행 중에 참가자가 빠져 대상이 바뀌었는지. */
  reassigned: boolean;
  /** `options`가 있으면 그중 하나를 골라서 하는 미션이다. 고르기 전에는 `body`가 null. */
  missions: { id: string; body: string | null; options: string[] | null; deliveredAt: Date; completed: boolean }[];
  targetRecords: FeedItem[];
  secretDeeds: { id: string; body: string; createdAt: Date }[];
};

export type Ranking = {
  /** `lines`는 점수 내역(기록, 미션). 누구에게나 보여도 되는 정보만 들어 있다. */
  entries: { id: string; name: string; points: number; lines: ScoreLine[]; isMe: boolean }[];
  stats: { recordCount: number; missionsDelivered: number; missionsCompleted: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function loadEvent(db: Db, eventId: string): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new Error(`event not found: ${eventId}`);
  return event;
}

export async function getLobby(db: Db, eventId: string): Promise<Lobby> {
  const event = await loadEvent(db, eventId);
  const rows = await db
    .select({ id: participants.id, name: participants.name, isOrganizer: participants.isOrganizer })
    .from(participants)
    .where(eq(participants.eventId, eventId))
    .orderBy(participants.createdAt, participants.id);
  return { participants: rows, startMissed: event.startMissedAt !== null, minParticipants: MIN_PARTICIPANTS };
}

/**
 * 기록을 보는 사람 기준으로 가공한다. 비밀 필드(judge, result)는 자격이 있을 때만 키를 만든다.
 * `judgeAuthorId`: 보는 사람이 마니또인 작성자(없으면 null).
 */
async function buildFeed(
  db: Db,
  event: Event,
  viewerId: string,
  judgeAuthorId: string | null,
  onlyAuthorId?: string,
): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: records.id,
      authorId: records.authorId,
      authorName: participants.name,
      body: records.body,
      createdAt: records.createdAt,
    })
    .from(records)
    .innerJoin(participants, eq(participants.id, records.authorId))
    .where(
      onlyAuthorId
        ? and(eq(records.eventId, event.id), eq(records.authorId, onlyAuthorId))
        : eq(records.eventId, event.id),
    )
    .orderBy(desc(records.createdAt), desc(records.id));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [verdictRows, reactionRows] = await Promise.all([
    db.select({ recordId: verdicts.recordId, isMine: verdicts.isMine }).from(verdicts).where(inArray(verdicts.recordId, ids)),
    db
      .select({ recordId: reactions.recordId, participantId: reactions.participantId, emoji: reactions.emoji })
      .from(reactions)
      .where(inArray(reactions.recordId, ids)),
  ]);
  const verdictByRecord = new Map(verdictRows.map((v) => [v.recordId, v.isMine]));
  const revealed = event.status === "revealed";

  return rows.map((r) => {
    const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const x of reactionRows) {
      if (x.recordId !== r.id) continue;
      const entry = counts.get(x.emoji) ?? { emoji: x.emoji, count: 0, mine: false };
      entry.count += 1;
      if (x.participantId === viewerId) entry.mine = true;
      counts.set(x.emoji, entry);
    }
    const item: FeedItem = {
      id: r.id,
      author: { id: r.authorId, name: r.authorName },
      body: r.body,
      createdAt: r.createdAt,
      isMine: r.authorId === viewerId,
      verdictStatus: verdictByRecord.has(r.id) ? "done" : "pending",
      reactions: [...counts.values()],
    };
    if (judgeAuthorId !== null && r.authorId === judgeAuthorId) {
      item.judge = { myVerdict: verdictByRecord.get(r.id) ?? null };
    }
    if (revealed) item.result = verdictByRecord.get(r.id) ?? null;
    return item;
  });
}

/**
 * 모두가 보는 홈 피드. 판정 질문(judge)은 넣지 않는다:
 * 홈 화면은 옆 사람 눈에 띄기 쉬워, 어느 글에 질문이 붙었는지로 내 대상이 드러날 수 있다.
 * 판정은 `getDuty`(내 임무)에서만 한다.
 */
export async function getFeed(db: Db, eventId: string, viewerId: string): Promise<FeedItem[]> {
  const event = await loadEvent(db, eventId);
  return buildFeed(db, event, viewerId, null);
}

/**
 * `내 임무` 메뉴에 붙이는 숫자: 아직 완료하지 않은 미션 + 아직 답하지 않은 대상의 기록.
 * 숫자만 돌려주므로 화면에 보여도 대상이 누구인지는 드러나지 않는다.
 */
export async function getDutyBadge(db: Db, eventId: string, viewerId: string): Promise<number> {
  const target = await getTargetOf(db, viewerId);
  if (!target) return 0;
  const [missionRows, recordRows] = await Promise.all([
    db
      .select({ id: missionDeliveries.id })
      .from(missionDeliveries)
      .where(
        and(
          eq(missionDeliveries.eventId, eventId),
          eq(missionDeliveries.participantId, viewerId),
          isNull(missionDeliveries.completedAt),
        ),
      ),
    db
      .select({ id: records.id, verdict: verdicts.recordId })
      .from(records)
      .leftJoin(verdicts, eq(verdicts.recordId, records.id))
      .where(and(eq(records.eventId, eventId), eq(records.authorId, target.id))),
  ]);
  return missionRows.length + recordRows.filter((r) => r.verdict === null).length;
}

export async function getDuty(db: Db, eventId: string, viewerId: string): Promise<Duty | null> {
  const target = await getTargetOf(db, viewerId);
  if (!target) return null;
  const event = await loadEvent(db, eventId);

  const [missionRows, deedRows, targetRecords, reassignedRows] = await Promise.all([
    db
      .select()
      .from(missionDeliveries)
      .where(and(eq(missionDeliveries.eventId, eventId), eq(missionDeliveries.participantId, viewerId)))
      .orderBy(missionDeliveries.deliveredAt, missionDeliveries.slotIndex),
    db
      .select({ id: secretDeeds.id, body: secretDeeds.body, createdAt: secretDeeds.createdAt })
      .from(secretDeeds)
      .where(and(eq(secretDeeds.eventId, eventId), eq(secretDeeds.giverId, viewerId)))
      .orderBy(desc(secretDeeds.createdAt), desc(secretDeeds.id)),
    buildFeed(db, event, viewerId, target.id, target.id),
    db.select({ reassignedAt: assignments.reassignedAt }).from(assignments).where(eq(assignments.giverId, viewerId)),
  ]);

  return {
    target: { id: target.id, name: target.name },
    reassigned: reassignedRows.some((a) => a.reassignedAt !== null),
    missions: missionRows.map((m) => ({
      id: m.id,
      body: m.body,
      options: m.options,
      deliveredAt: m.deliveredAt,
      completed: m.completedAt !== null,
    })),
    targetRecords,
    secretDeeds: deedRows,
  };
}

export async function getRanking(db: Db, eventId: string, viewerId: string): Promise<Ranking> {
  const [lines, members, recordRows, deliveryRows] = await Promise.all([
    liveLines(db, eventId),
    db.select({ id: participants.id, name: participants.name }).from(participants).where(eq(participants.eventId, eventId)),
    db.select({ id: records.id }).from(records).where(eq(records.eventId, eventId)),
    db
      .select({ completedAt: missionDeliveries.completedAt })
      .from(missionDeliveries)
      .where(eq(missionDeliveries.eventId, eventId)),
  ]);
  const entries = members
    .map((m) => {
      const mine = lines.get(m.id) ?? [];
      return { id: m.id, name: m.name, points: mine.reduce((sum, l) => sum + l.points, 0), lines: mine, isMe: m.id === viewerId };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return {
    entries,
    stats: {
      recordCount: recordRows.length,
      missionsDelivered: deliveryRows.length,
      missionsCompleted: deliveryRows.filter((d) => d.completedAt !== null).length,
    },
  };
}

function kstDayNumber(d: Date): number {
  return Date.parse(`${kstDayKey(d)}T00:00:00Z`) / DAY_MS;
}

export async function getHeader(
  db: Db,
  event: Event,
  now: Date,
): Promise<{ temperature: number; dday: number | null }> {
  const temp = await temperature(db, event);
  const dday =
    event.status === "active" ? Math.max(0, kstDayNumber(event.endsAt) - kstDayNumber(now)) : null;
  return { temperature: temp, dday };
}
