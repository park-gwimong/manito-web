/**
 * 둘러보기 화면(`/dev`)의 데이터.
 *
 * 배정을 그대로 내보내고 PIN 없이 들어가게 해 주므로, 실제 이벤트에는 절대 닿으면 안 된다.
 * - 개발 서버: 모든 이벤트를 보여 준다.
 * - 운영: `DEMO_MODE=1`일 때만 열리고, 샘플 이벤트(`demoSeededAt`이 있는 것)만 다룬다.
 */
import { asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { assignments, events, participants, type EventStatus } from "../db/schema";

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

/** 운영에서 샘플 둘러보기를 켰는지. */
export function demoEnabled(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** 둘러보기 화면을 열 수 있는지. */
export function canTour(): boolean {
  return isDev() || demoEnabled();
}

/** PIN 없이 들어가거나 배정을 보여 줘도 되는 이벤트인지. 개발 서버가 아니면 샘플만 된다. */
export function isTourable(event: { demoSeededAt: Date | null }): boolean {
  return isDev() || (demoEnabled() && event.demoSeededAt !== null);
}

export type DevEvent = {
  id: string;
  code: string;
  name: string;
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  /** 입장 순서대로. `targetName`은 이 사람이 챙기는 대상(배정 전이면 null). */
  members: { id: string; name: string; isOrganizer: boolean; targetName: string | null }[];
};

const STATUS_ORDER: EventStatus[] = ["preparing", "active", "closed", "revealed"];

export async function getDevOverview(db: Db): Promise<DevEvent[]> {
  if (!canTour()) throw new Error("둘러보기가 꺼져 있습니다.");
  const rows = isDev()
    ? await db.select().from(events)
    : await db.select().from(events).where(isNotNull(events.demoSeededAt));
  rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const result: DevEvent[] = [];
  for (const event of rows) {
    const people = await db
      .select()
      .from(participants)
      .where(eq(participants.eventId, event.id))
      .orderBy(asc(participants.createdAt));
    const pairs = await db.select().from(assignments).where(eq(assignments.eventId, event.id));
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const targetOf = new Map(pairs.map((a) => [a.giverId, nameOf.get(a.receiverId) ?? null]));
    result.push({
      id: event.id,
      code: event.code,
      name: event.name,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      members: people.map((p) => ({
        id: p.id,
        name: p.name,
        isOrganizer: p.isOrganizer,
        targetName: targetOf.get(p.id) ?? null,
      })),
    });
  }
  return result;
}
