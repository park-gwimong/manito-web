import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { events, participants, type Participant } from "@/db/schema";
import { NAME_MAX, PIN_LOCK_MINUTES, PIN_MAX_FAILS } from "./constants";
import { DomainError } from "./errors";

const BCRYPT_COST = process.env.NODE_ENV === "test" ? 4 : 10;

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_COST);
}

export function normalizeName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    throw new DomainError("INVALID_NAME", `이름은 1자 이상 ${NAME_MAX}자 이하로 입력해 주세요.`);
  }
  return name;
}

export function assertValidPin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new DomainError("INVALID_PIN", "PIN은 숫자 4자리로 입력해 주세요.");
  }
}

/** 상수 시간 비교. 환경변수가 비어 있으면 항상 false. */
export function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function getParticipant(db: Db, id: string): Promise<Participant> {
  const [p] = await db.select().from(participants).where(eq(participants.id, id));
  if (!p) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  return p;
}

async function requireOrganizer(db: Db, organizerId: string): Promise<Participant> {
  const p = await getParticipant(db, organizerId);
  if (!p.isOrganizer) throw new DomainError("NOT_ORGANIZER", "개설자만 할 수 있어요.");
  return p;
}

export async function joinEvent(
  db: Db,
  eventId: string,
  input: { name: string; pin: string },
  now: Date,
): Promise<Participant> {
  void now;
  const name = normalizeName(input.name);
  assertValidPin(input.pin);
  const pinHash = await hashPin(input.pin);
  // 이벤트 행을 FOR SHARE로 잠가 시작 처리(FOR UPDATE)와 직렬화한다.
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("share");
    if (!event) throw new DomainError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없어요.");
    if (event.status !== "preparing") {
      throw new DomainError("NOT_PREPARING", "이미 시작된 이벤트에는 참가할 수 없어요.");
    }
    const [dup] = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.eventId, eventId), eq(participants.name, name)));
    if (dup) throw new DomainError("NAME_TAKEN", "이미 사용 중인 이름이에요. 다른 이름을 입력해 주세요.");
    const [created] = await tx.insert(participants).values({ eventId, name, pinHash }).returning();
    return created;
  });
}

export async function loginWithPin(
  db: Db,
  participantId: string,
  pin: string,
  now: Date,
): Promise<Participant> {
  const p = await getParticipant(db, participantId);
  if (p.pinLockedUntil && p.pinLockedUntil.getTime() > now.getTime()) {
    throw new DomainError("PIN_LOCKED", "PIN을 여러 번 틀려 잠시 잠겼어요. 5분 뒤에 다시 시도해 주세요.");
  }
  if (!p.pinHash) {
    throw new DomainError("PIN_RESET_REQUIRED", "PIN이 초기화되었어요. 새 PIN을 설정해 주세요.");
  }
  if (!(await bcrypt.compare(pin, p.pinHash))) {
    // 동시 요청에도 횟수가 누락되지 않도록 SQL에서 원자적으로 증가시킨다.
    const [counted] = await db
      .update(participants)
      .set({ failedPinAttempts: sql`${participants.failedPinAttempts} + 1` })
      .where(eq(participants.id, participantId))
      .returning({ attempts: participants.failedPinAttempts });
    const lock = counted.attempts >= PIN_MAX_FAILS;
    if (lock) {
      await db
        .update(participants)
        .set({ pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) })
        .where(eq(participants.id, participantId));
    }
    throw new DomainError(
      "WRONG_PIN",
      lock
        ? `PIN이 맞지 않아요. ${PIN_LOCK_MINUTES}분 동안 잠겼어요.`
        : "PIN이 맞지 않아요. 다시 확인해 주세요.",
    );
  }
  const [updated] = await db
    .update(participants)
    .set({ failedPinAttempts: 0, pinLockedUntil: null })
    .where(eq(participants.id, participantId))
    .returning();
  return updated;
}

export async function setNewPin(
  db: Db,
  participantId: string,
  pin: string,
  now: Date,
): Promise<Participant> {
  void now;
  const p = await getParticipant(db, participantId);
  const notReset = () => new DomainError("PIN_NOT_RESET", "PIN이 초기화된 경우에만 새로 설정할 수 있어요.");
  if (p.pinHash) throw notReset();
  assertValidPin(pin);
  const [updated] = await db
    .update(participants)
    .set({ pinHash: await hashPin(pin), failedPinAttempts: 0, pinLockedUntil: null })
    .where(and(eq(participants.id, participantId), isNull(participants.pinHash)))
    .returning();
  if (!updated) throw notReset();
  return updated;
}

async function clearPin(db: Db, targetId: string, now: Date): Promise<void> {
  await db
    .update(participants)
    .set({ pinHash: null, pinResetAt: now, failedPinAttempts: 0, pinLockedUntil: null })
    .where(eq(participants.id, targetId));
}

export async function resetPin(db: Db, organizerId: string, targetId: string, now: Date): Promise<void> {
  const organizer = await requireOrganizer(db, organizerId);
  const target = await getParticipant(db, targetId);
  if (target.eventId !== organizer.eventId) {
    throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  }
  await clearPin(db, targetId, now);
}

export async function resetOrganizerPin(
  db: Db,
  eventId: string,
  adminPassword: string,
  now: Date,
): Promise<void> {
  if (!verifyAdminPassword(adminPassword)) {
    throw new DomainError("WRONG_ADMIN_PASSWORD", "관리 비밀번호가 맞지 않아요.");
  }
  const [organizer] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.eventId, eventId), eq(participants.isOrganizer, true)));
  if (!organizer) throw new DomainError("PARTICIPANT_NOT_FOUND", "개설자를 찾을 수 없어요.");
  await clearPin(db, organizer.id, now);
}

export async function acknowledgePinReset(db: Db, participantId: string): Promise<void> {
  await db.update(participants).set({ pinResetAt: null }).where(eq(participants.id, participantId));
}

export async function removeParticipant(db: Db, organizerId: string, targetId: string): Promise<void> {
  const organizer = await requireOrganizer(db, organizerId);
  if (targetId === organizerId) {
    throw new DomainError("CANNOT_REMOVE_ORGANIZER", "개설자는 내보낼 수 없어요.");
  }
  const target = await getParticipant(db, targetId);
  if (target.eventId !== organizer.eventId) {
    throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  }
  // 이벤트 행을 잠근 채 상태를 다시 확인해, 시작 처리 도중 삭제가 끼어들지 못하게 한다.
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, organizer.eventId)).for("share");
    if (event.status !== "preparing") {
      throw new DomainError("NOT_PREPARING", "이벤트가 시작된 뒤에는 참가자를 내보낼 수 없어요.");
    }
    await tx.delete(participants).where(eq(participants.id, targetId));
  });
}
