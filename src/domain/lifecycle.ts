import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assignments, events, participants, type Event, type Participant } from "@/db/schema";
import { MIN_PARTICIPANTS } from "./constants";
import { DomainError } from "./errors";
import { deliverDueMissions } from "./missions";

/** rng로 섞은 뒤 i번째가 (i+1)번째에게, 마지막이 첫 번째에게 주는 하나의 고리. */
export function buildChain(
  ids: string[],
  rng: () => number,
): { giverId: string; receiverId: string }[] {
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((giverId, i) => ({
    giverId,
    receiverId: shuffled[(i + 1) % shuffled.length],
  }));
}

async function loadEvent(db: Db, eventId: string): Promise<Event> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new DomainError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없어요.");
  return event;
}

/** 준비 중 이벤트의 시작 처리: 4명 이상이면 배정 후 active, 미만이면 startMissedAt 기록. */
async function startEvent(db: Db, event: Event, now: Date, rng: () => number): Promise<void> {
  await db.transaction(async (tx) => {
    // 이벤트 행을 먼저 잠근다. 입장/내보내기는 FOR SHARE로 같은 행을 잠그므로 이후 명단이 바뀌지 않는다.
    const [locked] = await tx.select().from(events).where(eq(events.id, event.id)).for("update");
    if (!locked || locked.status !== "preparing" || locked.startMissedAt !== null) return;
    const members = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.eventId, event.id));
    const expected = and(
      eq(events.id, event.id),
      eq(events.status, "preparing"),
      isNull(events.startMissedAt),
    );
    if (members.length < MIN_PARTICIPANTS) {
      await tx.update(events).set({ startMissedAt: now }).where(expected);
      return;
    }
    const changed = await tx
      .update(events)
      .set({ status: "active" })
      .where(expected)
      .returning({ id: events.id });
    // 다른 호출이 먼저 전환했다면 배정을 넣지 않는다.
    if (changed.length === 0) return;
    await tx.insert(assignments).values(
      buildChain(
        members.map((m) => m.id),
        rng,
      ).map((pair) => ({ eventId: event.id, ...pair })),
    );
  });
}

async function closeEvent(db: Db, event: Event): Promise<void> {
  await db
    .update(events)
    .set({ status: "closed" })
    .where(and(eq(events.id, event.id), eq(events.status, "active")));
}

/** 시각에 따라 이벤트 단계를 전환하고 최신 이벤트를 돌려준다. 여러 번 불러도 안전하다. */
export async function advanceEvent(
  db: Db,
  eventId: string,
  now: Date,
  rng: () => number = Math.random,
): Promise<Event> {
  let event = await loadEvent(db, eventId);

  if (event.status === "preparing" && now >= event.startsAt && event.startMissedAt === null) {
    await startEvent(db, event, now, rng);
    event = await loadEvent(db, eventId);
  }

  if (event.status === "active") {
    // 종료 뒤에 처음 불려도 모든 슬롯이 배달되도록, 마감 처리보다 먼저 배달한다.
    await deliverDueMissions(db, event, now, rng);
    if (now >= event.endsAt) {
      await closeEvent(db, event);
      event = await loadEvent(db, eventId);
    }
  }

  return event;
}

export async function getTargetOf(db: Db, giverId: string): Promise<Participant | null> {
  const [row] = await db
    .select({ participant: participants })
    .from(assignments)
    .innerJoin(participants, eq(participants.id, assignments.receiverId))
    .where(eq(assignments.giverId, giverId));
  return row?.participant ?? null;
}

export async function getGiverIdOf(db: Db, receiverId: string): Promise<string | null> {
  const [row] = await db
    .select({ giverId: assignments.giverId })
    .from(assignments)
    .where(eq(assignments.receiverId, receiverId));
  return row?.giverId ?? null;
}
