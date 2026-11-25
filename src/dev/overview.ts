/**
 * 개발 전용 둘러보기 화면(`/dev`)의 데이터.
 * 배정을 그대로 내보내므로 운영에서는 절대 불리면 안 된다. 모든 함수가 `assertDev()`로 시작한다.
 */
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { assignments, events, participants, type EventStatus } from "../db/schema";

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export function assertDev(): void {
  if (!isDev()) throw new Error("개발 서버에서만 쓸 수 있는 기능입니다.");
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
  assertDev();
  const rows = await db.select().from(events);
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
