import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  events,
  missionDeliveries,
  missionTemplates,
  participants,
  type Event,
} from "@/db/schema";
import { BODY_MAX } from "./constants";
import { DomainError } from "./errors";
import { advanceEvent } from "./lifecycle";
import { MISSION_CHOICES, slotTimes, type MissionPlan } from "./mission-plan";
import { enqueue } from "./notifications";

/** 목록에서 서로 다른 본문을 `count`개까지 고른다. 아직 받아 보지 않은 것을 먼저 쓴다. */
function pickBodies(all: string[], received: Set<string>, count: number, rng: () => number): string[] {
  const unique = [...new Set(all)];
  const picks: string[] = [];
  while (picks.length < Math.min(count, unique.length)) {
    const left = unique.filter((b) => !picks.includes(b));
    const fresh = left.filter((b) => !received.has(b));
    const pool = fresh.length > 0 ? fresh : left;
    picks.push(pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]);
  }
  return picks;
}

/** 슬롯(몇 번째 미션)의 도착 시각. 규칙은 `mission-plan.ts`에 있다. 방식을 생략하면 custom으로 본다. */
export function slotTime(
  event: Pick<MissionPlan, "startsAt" | "endsAt" | "missionCount"> & Partial<MissionPlan>,
  slotIndex: number,
): Date {
  return slotTimes({ missionMode: "custom", missionHour: 9, ...event })[slotIndex];
}

/** 시각이 지난 슬롯 중 아직 배달되지 않은 것을 참가자마다 넣는다. 여러 번 불러도 슬롯당 한 건. */
export async function deliverDueMissions(
  db: Db,
  event: Event,
  now: Date,
  rng: () => number,
): Promise<void> {
  const times = slotTimes(event);
  const dueSlots = times.map((_, i) => i).filter((i) => times[i].getTime() <= now.getTime());
  if (dueSlots.length === 0) return;

  await db.transaction(async (tx) => {
    // 같은 이벤트의 배달이 동시에 돌면 같은 참가자가 같은 본문을 두 번 받을 수 있어 행을 잠근다.
    await tx.select({ id: events.id }).from(events).where(eq(events.id, event.id)).for("update");
    const members = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.eventId, event.id));
    const templates = await tx
      .select({ body: missionTemplates.body })
      .from(missionTemplates)
      .where(eq(missionTemplates.eventId, event.id));
    if (templates.length === 0) return;
    const existing = await tx
      .select({
        participantId: missionDeliveries.participantId,
        slotIndex: missionDeliveries.slotIndex,
        body: missionDeliveries.body,
        options: missionDeliveries.options,
      })
      .from(missionDeliveries)
      .where(eq(missionDeliveries.eventId, event.id));

    // 매일 방식에서는 안을 여러 개 보내고 받은 사람이 하나를 고른다.
    const perSlot = event.missionMode === "daily" ? MISSION_CHOICES : 1;
    const bodies = templates.map((t) => t.body);
    const rows: (typeof missionDeliveries.$inferInsert)[] = [];
    for (const member of members) {
      const mine = existing.filter((d) => d.participantId === member.id);
      const doneSlots = new Set(mine.map((d) => d.slotIndex));
      // 고르지 않은 안도 한 번 본 것이니 다음에는 다른 미션을 보여 준다.
      const received = new Set(mine.flatMap((d) => [...(d.options ?? []), ...(d.body === null ? [] : [d.body])]));
      for (const slotIndex of dueSlots) {
        if (doneSlots.has(slotIndex)) continue;
        const picks = pickBodies(bodies, received, perSlot, rng);
        for (const body of picks) received.add(body);
        const choice = picks.length > 1;
        rows.push({
          eventId: event.id,
          participantId: member.id,
          body: choice ? null : picks[0],
          options: choice ? picks : null,
          slotIndex,
          deliveredAt: times[slotIndex],
        });
      }
    }
    if (rows.length === 0) return;
    const inserted = await tx
      .insert(missionDeliveries)
      .values(rows)
      .onConflictDoNothing()
      .returning({ participantId: missionDeliveries.participantId, slotIndex: missionDeliveries.slotIndex });
    // 첫 미션은 시작 알림과 겹치고, 종료 뒤에 몰아서 배달된 미션은 할 수 없으니 알리지 않는다.
    if (now.getTime() >= event.endsAt.getTime()) return;
    await enqueue(
      tx,
      event.id,
      inserted.filter((r) => r.slotIndex > 0).map((r) => r.participantId),
      "mission",
    );
  });
}

/** 내게 온 배달인지, 진행 중인지 확인하고 돌려준다. */
async function loadMyDelivery(db: Db, participantId: string, deliveryId: string, now: Date) {
  const [participant] = await db.select().from(participants).where(eq(participants.id, participantId));
  if (!participant) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  const event = await advanceEvent(db, participant.eventId, now);

  const [delivery] = await db
    .select()
    .from(missionDeliveries)
    .where(eq(missionDeliveries.id, deliveryId));
  if (!delivery || delivery.participantId !== participantId) {
    throw new DomainError("NOT_YOURS", "내게 온 미션만 할 수 있어요.");
  }
  if (event.status !== "active") {
    throw new DomainError("NOT_ACTIVE", "진행 중일 때만 할 수 있어요.");
  }
  return delivery;
}

/** 받은 안 중 하나를 고른다. 완료하기 전에는 다른 안으로 바꿀 수 있다. */
export async function chooseMission(
  db: Db,
  participantId: string,
  deliveryId: string,
  body: string,
  now: Date,
): Promise<void> {
  const delivery = await loadMyDelivery(db, participantId, deliveryId, now);
  if (!delivery.options?.includes(body)) {
    throw new DomainError("NOT_AN_OPTION", "받은 미션 중에서 골라 주세요.");
  }
  const changed = await db
    .update(missionDeliveries)
    .set({ body })
    .where(and(eq(missionDeliveries.id, deliveryId), isNull(missionDeliveries.completedAt)))
    .returning({ id: missionDeliveries.id });
  if (changed.length === 0) {
    throw new DomainError("ALREADY_COMPLETED", "완료한 미션은 바꿀 수 없어요.");
  }
}

export async function completeMission(
  db: Db,
  participantId: string,
  deliveryId: string,
  now: Date,
): Promise<void> {
  const delivery = await loadMyDelivery(db, participantId, deliveryId, now);
  if (delivery.body === null) {
    throw new DomainError("NOT_CHOSEN", "할 미션을 먼저 골라 주세요.");
  }
  await db
    .update(missionDeliveries)
    .set({ completedAt: now })
    .where(and(eq(missionDeliveries.id, deliveryId), isNull(missionDeliveries.completedAt)));
}

export async function listTemplates(db: Db, eventId: string): Promise<{ id: string; body: string }[]> {
  return db
    .select({ id: missionTemplates.id, body: missionTemplates.body })
    .from(missionTemplates)
    .where(eq(missionTemplates.eventId, eventId));
}

function validateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > BODY_MAX) {
    throw new DomainError("INVALID_BODY", `미션은 1자 이상 ${BODY_MAX}자 이하로 적어 주세요.`);
  }
  return trimmed;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** 개설자 확인 → advanceEvent → 준비 중 확인. 이벤트 행을 잠근 트랜잭션 안에서 fn을 실행한다. */
async function withPreparingEvent<T>(
  db: Db,
  organizerId: string,
  now: Date,
  fn: (tx: Tx, event: Event) => Promise<T>,
): Promise<T> {
  const [organizer] = await db.select().from(participants).where(eq(participants.id, organizerId));
  if (!organizer || !organizer.isOrganizer) {
    throw new DomainError("NOT_ORGANIZER", "개설자만 할 수 있어요.");
  }
  await advanceEvent(db, organizer.eventId, now);
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, organizer.eventId))
      .for("update");
    if (!event) throw new DomainError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없어요.");
    if (event.status !== "preparing") {
      throw new DomainError("NOT_PREPARING", "이벤트가 시작된 뒤에는 미션을 바꿀 수 없어요.");
    }
    return fn(tx, event);
  });
}

const templateNotFound = () => new DomainError("TEMPLATE_NOT_FOUND", "미션을 찾을 수 없어요.");

export async function addTemplate(
  db: Db,
  organizerId: string,
  body: string,
  now: Date,
): Promise<{ id: string; body: string }> {
  return withPreparingEvent(db, organizerId, now, async (tx, event) => {
    const text = validateBody(body);
    const [row] = await tx
      .insert(missionTemplates)
      .values({ eventId: event.id, body: text })
      .returning({ id: missionTemplates.id, body: missionTemplates.body });
    return row;
  });
}

export async function updateTemplate(
  db: Db,
  organizerId: string,
  templateId: string,
  body: string,
  now: Date,
): Promise<void> {
  await withPreparingEvent(db, organizerId, now, async (tx, event) => {
    const text = validateBody(body);
    const changed = await tx
      .update(missionTemplates)
      .set({ body: text })
      .where(and(eq(missionTemplates.id, templateId), eq(missionTemplates.eventId, event.id)))
      .returning({ id: missionTemplates.id });
    if (changed.length === 0) throw templateNotFound();
  });
}

export async function deleteTemplate(
  db: Db,
  organizerId: string,
  templateId: string,
  now: Date,
): Promise<void> {
  await withPreparingEvent(db, organizerId, now, async (tx, event) => {
    const all = await tx
      .select({ id: missionTemplates.id })
      .from(missionTemplates)
      .where(eq(missionTemplates.eventId, event.id));
    if (!all.some((t) => t.id === templateId)) throw templateNotFound();
    if (event.missionMode !== "custom") {
      // 개수가 일정으로 정해지는 방식에서는 목록이 비지만 않으면 된다.
      if (all.length - 1 < 1) {
        throw new DomainError("TOO_FEW_TEMPLATES", "미션은 하나 이상 남겨 두어야 해요.");
      }
    } else if (all.length - 1 < event.missionCount) {
      throw new DomainError(
        "TOO_FEW_TEMPLATES",
        `미션이 ${event.missionCount}개보다 적어져요. 미션 개수를 먼저 줄여 주세요.`,
      );
    }
    await tx.delete(missionTemplates).where(eq(missionTemplates.id, templateId));
  });
}
