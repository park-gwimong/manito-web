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
import { enqueue } from "./notifications";

/** 슬롯 시각: startsAt + slotIndex × (endsAt − startsAt) / missionCount. 0번 슬롯은 시작 시각. */
export function slotTime(
  event: { startsAt: Date; endsAt: Date; missionCount: number },
  slotIndex: number,
): Date {
  const span = event.endsAt.getTime() - event.startsAt.getTime();
  return new Date(event.startsAt.getTime() + Math.floor((slotIndex * span) / event.missionCount));
}

/** 시각이 지난 슬롯 중 아직 배달되지 않은 것을 참가자마다 넣는다. 여러 번 불러도 슬롯당 한 건. */
export async function deliverDueMissions(
  db: Db,
  event: Event,
  now: Date,
  rng: () => number,
): Promise<void> {
  const dueSlots: number[] = [];
  for (let i = 0; i < event.missionCount; i++) {
    if (slotTime(event, i).getTime() <= now.getTime()) dueSlots.push(i);
  }
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
      })
      .from(missionDeliveries)
      .where(eq(missionDeliveries.eventId, event.id));

    const rows: (typeof missionDeliveries.$inferInsert)[] = [];
    for (const member of members) {
      const mine = existing.filter((d) => d.participantId === member.id);
      const doneSlots = new Set(mine.map((d) => d.slotIndex));
      const received = new Set(mine.map((d) => d.body));
      for (const slotIndex of dueSlots) {
        if (doneSlots.has(slotIndex)) continue;
        const fresh = templates.filter((t) => !received.has(t.body));
        const pool = fresh.length > 0 ? fresh : templates;
        const body = pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)].body;
        received.add(body);
        rows.push({
          eventId: event.id,
          participantId: member.id,
          body,
          slotIndex,
          deliveredAt: slotTime(event, slotIndex),
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

export async function completeMission(
  db: Db,
  participantId: string,
  deliveryId: string,
  now: Date,
): Promise<void> {
  const [participant] = await db.select().from(participants).where(eq(participants.id, participantId));
  if (!participant) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  const event = await advanceEvent(db, participant.eventId, now);

  const [delivery] = await db
    .select()
    .from(missionDeliveries)
    .where(eq(missionDeliveries.id, deliveryId));
  if (!delivery || delivery.participantId !== participantId) {
    throw new DomainError("NOT_YOURS", "내게 온 미션만 완료할 수 있어요.");
  }
  if (event.status !== "active") {
    throw new DomainError("NOT_ACTIVE", "진행 중일 때만 미션을 완료할 수 있어요.");
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
    if (all.length - 1 < event.missionCount) {
      throw new DomainError(
        "TOO_FEW_TEMPLATES",
        `미션이 ${event.missionCount}개보다 적어져요. 미션 개수를 먼저 줄여 주세요.`,
      );
    }
    await tx.delete(missionTemplates).where(eq(missionTemplates.id, templateId));
  });
}
