import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assignments, events, participants, type Event, type Participant } from "@/db/schema";
import { MIN_PARTICIPANTS } from "./constants";
import { DomainError } from "./errors";
import { deliverDueMissions } from "./missions";
import { enqueue } from "./notifications";

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
    await enqueue(
      tx,
      event.id,
      members.map((m) => m.id),
      "started",
    );
  });
}

/** 진행 중 → 마감. `endsAt`을 주면 종료 시각도 함께 바꾼다(지금 마감). 모두에게 마감을 알린다. */
async function closeEvent(db: Db, event: Event, endsAt?: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(events)
      .set(endsAt ? { status: "closed", endsAt } : { status: "closed" })
      .where(and(eq(events.id, event.id), eq(events.status, "active")))
      .returning({ id: events.id });
    if (changed.length === 0) return false;
    const members = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.eventId, event.id));
    await enqueue(
      tx,
      event.id,
      members.map((m) => m.id),
      "closed",
    );
    return true;
  });
}

async function requireOrganizerEvent(db: Db, organizerId: string): Promise<Participant> {
  const [me] = await db.select().from(participants).where(eq(participants.id, organizerId));
  if (!me) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  if (!me.isOrganizer) throw new DomainError("NOT_ORGANIZER", "개설자만 할 수 있어요.");
  return me;
}

/**
 * 개설자가 시작 시각을 기다리지 않고 바로 시작한다.
 * 시작 시각을 지금으로 당기므로 미션 일정도 지금부터 종료 시각까지로 다시 나뉜다.
 */
export async function startNow(
  db: Db,
  organizerId: string,
  now: Date,
  rng: () => number = Math.random,
): Promise<void> {
  const me = await requireOrganizerEvent(db, organizerId);
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, me.eventId)).for("update");
    if (!event || event.status !== "preparing") {
      throw new DomainError("NOT_PREPARING", "이미 시작한 이벤트예요.");
    }
    if (event.endsAt.getTime() <= now.getTime()) {
      throw new DomainError("END_IN_PAST", "종료 일시가 이미 지났어요. 종료 일시를 먼저 바꿔 주세요.");
    }
    const members = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.eventId, event.id));
    if (members.length < MIN_PARTICIPANTS) {
      throw new DomainError(
        "NOT_ENOUGH_PARTICIPANTS",
        `${MIN_PARTICIPANTS}명부터 시작할 수 있어요. ${MIN_PARTICIPANTS - members.length}명 더 필요해요.`,
      );
    }
    await tx.update(events).set({ startsAt: now, startMissedAt: null }).where(eq(events.id, event.id));
  });
  const started = await advanceEvent(db, me.eventId, now, rng);
  if (started.status === "preparing") {
    throw new DomainError("START_FAILED", "시작하지 못했어요. 인원을 확인하고 다시 시도해 주세요.");
  }
}

/**
 * 진행 중에 종료 일시를 바꾼다(연장 또는 단축).
 * 이미 보낸 미션은 그대로 두고, 아직 보내지 않은 미션의 도착 시각만 새 기간에 맞춰 다시 나뉜다.
 */
export async function changeEndsAt(db: Db, organizerId: string, endsAt: Date, now: Date): Promise<void> {
  const me = await requireOrganizerEvent(db, organizerId);
  await advanceEvent(db, me.eventId, now);
  if (endsAt.getTime() <= now.getTime()) {
    throw new DomainError("END_IN_PAST", "종료 일시는 지금보다 뒤여야 해요. 바로 끝내려면 지금 마감하기를 눌러 주세요.");
  }
  const changed = await db
    .update(events)
    .set({ endsAt })
    .where(and(eq(events.id, me.eventId), eq(events.status, "active")))
    .returning({ id: events.id });
  if (changed.length === 0) {
    throw new DomainError("NOT_ACTIVE", "진행 중일 때만 종료 일시를 바꿀 수 있어요.");
  }
}

/** 진행 중인 이벤트를 지금 마감한다. 아직 보내지 않은 미션은 보내지 않는다. */
export async function closeNow(db: Db, organizerId: string, now: Date): Promise<void> {
  const me = await requireOrganizerEvent(db, organizerId);
  const event = await advanceEvent(db, me.eventId, now);
  if (event.status !== "active" || !(await closeEvent(db, event, now))) {
    throw new DomainError("NOT_ACTIVE", "진행 중일 때만 마감할 수 있어요.");
  }
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
