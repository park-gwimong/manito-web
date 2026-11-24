import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { events, missionTemplates, participants, type Event, type Participant } from "@/db/schema";
import { DEFAULT_MISSIONS } from "./default-missions";
import { DomainError } from "./errors";
import { assertValidPin, hashPin, normalizeName } from "./participants";

// 헷갈리기 쉬운 문자(0/O, 1/I/L)를 뺀 코드 알파벳
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function validateSchedule(
  input: { startsAt: Date; endsAt: Date; missionCount: number },
  templateCount: number,
  now: Date,
): void {
  if (input.startsAt.getTime() <= now.getTime()) {
    throw new DomainError("START_IN_PAST", "시작 시각은 지금보다 뒤여야 해요.");
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new DomainError("END_BEFORE_START", "종료 시각은 시작 시각보다 뒤여야 해요.");
  }
  if (!Number.isInteger(input.missionCount) || input.missionCount < 0 || input.missionCount > templateCount) {
    throw new DomainError("BAD_MISSION_COUNT", `미션 개수는 0개 이상 ${templateCount}개 이하로 정해 주세요.`);
  }
}

export async function createEvent(
  db: Db,
  input: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    missionCount: number;
    organizerName: string;
    organizerPin: string;
  },
  now: Date,
): Promise<{ event: Event; organizer: Participant }> {
  const name = input.name.trim();
  if (!name) throw new DomainError("INVALID_EVENT_NAME", "이벤트 이름을 입력해 주세요.");
  const organizerName = normalizeName(input.organizerName);
  assertValidPin(input.organizerPin);
  validateSchedule(input, DEFAULT_MISSIONS.length, now);
  const pinHash = await hashPin(input.organizerPin);

  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        code: generateCode(),
        name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        missionCount: input.missionCount,
      })
      .returning();
    await tx
      .insert(missionTemplates)
      .values(DEFAULT_MISSIONS.map((body) => ({ eventId: event.id, body })));
    const [organizer] = await tx
      .insert(participants)
      .values({ eventId: event.id, name: organizerName, pinHash, isOrganizer: true })
      .returning();
    return { event, organizer };
  });
}

export async function getEventByCode(db: Db, code: string): Promise<Event | null> {
  const [event] = await db.select().from(events).where(eq(events.code, code));
  return event ?? null;
}

export async function updateEventSettings(
  db: Db,
  organizerId: string,
  input: { name: string; startsAt: Date; endsAt: Date; missionCount: number },
  now: Date,
): Promise<Event> {
  const [organizer] = await db.select().from(participants).where(eq(participants.id, organizerId));
  if (!organizer || !organizer.isOrganizer) {
    throw new DomainError("NOT_ORGANIZER", "개설자만 할 수 있어요.");
  }
  // 이벤트 행을 FOR UPDATE로 잠근 채 상태를 다시 확인해, 시작 처리와 설정 변경이 겹치지 않게 한다.
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(eq(events.id, organizer.eventId)).for("update");
    if (!event) throw new DomainError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없어요.");
    if (event.status !== "preparing") {
      throw new DomainError("NOT_PREPARING", "이벤트가 시작된 뒤에는 설정을 바꿀 수 없어요.");
    }
    const name = input.name.trim();
    if (!name) throw new DomainError("INVALID_EVENT_NAME", "이벤트 이름을 입력해 주세요.");
    const templates = await tx
      .select({ id: missionTemplates.id })
      .from(missionTemplates)
      .where(eq(missionTemplates.eventId, event.id));
    validateSchedule(input, templates.length, now);
    const [updated] = await tx
      .update(events)
      .set({
        name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        missionCount: input.missionCount,
        startMissedAt: null,
      })
      .where(eq(events.id, event.id))
      .returning();
    return updated;
  });
}
