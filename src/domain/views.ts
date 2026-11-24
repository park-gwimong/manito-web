import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
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
import { kstDayKey, livePoints, temperature } from "./scoring";

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
  missions: { id: string; body: string; deliveredAt: Date; completed: boolean }[];
  targetRecords: FeedItem[];
  secretDeeds: { id: string; body: string; createdAt: Date }[];
};

export type Ranking = {
  entries: { id: string; name: string; points: number; isMe: boolean }[];
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

export async function getFeed(db: Db, eventId: string, viewerId: string): Promise<FeedItem[]> {
  const event = await loadEvent(db, eventId);
  const target = await getTargetOf(db, viewerId);
  return buildFeed(db, event, viewerId, target?.id ?? null);
}

export async function getDuty(db: Db, eventId: string, viewerId: string): Promise<Duty | null> {
  const target = await getTargetOf(db, viewerId);
  if (!target) return null;
  const event = await loadEvent(db, eventId);

  const [missionRows, deedRows, targetRecords] = await Promise.all([
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
  ]);

  return {
    target: { id: target.id, name: target.name },
    missions: missionRows.map((m) => ({
      id: m.id,
      body: m.body,
      deliveredAt: m.deliveredAt,
      completed: m.completedAt !== null,
    })),
    targetRecords,
    secretDeeds: deedRows,
  };
}

export async function getRanking(db: Db, eventId: string, viewerId: string): Promise<Ranking> {
  const [points, members, recordRows, deliveryRows] = await Promise.all([
    livePoints(db, eventId),
    db.select({ id: participants.id, name: participants.name }).from(participants).where(eq(participants.eventId, eventId)),
    db.select({ id: records.id }).from(records).where(eq(records.eventId, eventId)),
    db
      .select({ completedAt: missionDeliveries.completedAt })
      .from(missionDeliveries)
      .where(eq(missionDeliveries.eventId, eventId)),
  ]);
  const entries = members
    .map((m) => ({ id: m.id, name: m.name, points: points.get(m.id) ?? 0, isMe: m.id === viewerId }))
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
