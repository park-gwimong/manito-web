import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { events, missionTemplates, participants, type Event, type Participant } from "@/db/schema";
import { DEFAULT_MISSIONS } from "./default-missions";
import { DomainError } from "./errors";
import {
  isMissionHour,
  isMissionMode,
  plannedMissionCount,
  DEFAULT_MISSION_HOUR,
  type MissionMode,
} from "./mission-plan";
import { assertValidPin, hashPin, normalizeName } from "./participants";

// 헷갈리기 쉬운 문자(0/O, 1/I/L)를 뺀 코드 알파벳
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** 일정과 미션 방식 입력. 방식을 생략하면 개수를 직접 정하는 custom이다. */
export type ScheduleInput = {
  startsAt: Date;
  endsAt: Date;
  missionCount: number;
  missionMode?: MissionMode;
  missionHour?: number;
};

/** 검증하고, 저장할 미션 설정을 돌려준다. 매일·이틀 방식의 개수는 일정에서 계산한다. */
export function validateSchedule(
  input: ScheduleInput,
  templateCount: number,
  now: Date,
): { missionMode: MissionMode; missionHour: number; missionCount: number } {
  if (input.startsAt.getTime() <= now.getTime()) {
    throw new DomainError("START_IN_PAST", "시작 시각은 지금보다 뒤여야 해요.");
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new DomainError("END_BEFORE_START", "종료 시각은 시작 시각보다 뒤여야 해요.");
  }
  const missionMode = input.missionMode ?? "custom";
  const missionHour = input.missionHour ?? DEFAULT_MISSION_HOUR;
  if (!isMissionMode(missionMode)) {
    throw new DomainError("BAD_MISSION_MODE", "미션을 보내는 방식을 골라 주세요.");
  }
  if (!isMissionHour(missionHour)) {
    throw new DomainError("BAD_MISSION_HOUR", "미션 도착 시각을 골라 주세요.");
  }
  if (missionMode !== "custom") {
    // 개수는 일정이 정한다. 미션 목록보다 길어지면 받았던 미션이 다시 올 뿐이라 막지 않는다.
    const missionCount = plannedMissionCount({ ...input, missionMode, missionHour, missionCount: 0 });
    return { missionMode, missionHour, missionCount };
  }
  if (!Number.isInteger(input.missionCount) || input.missionCount < 0 || input.missionCount > templateCount) {
    throw new DomainError("BAD_MISSION_COUNT", `미션 개수는 0개 이상 ${templateCount}개 이하로 정해 주세요.`);
  }
  return { missionMode, missionHour, missionCount: input.missionCount };
}

export async function createEvent(
  db: Db,
  input: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    missionCount: number;
    missionMode?: MissionMode;
    missionHour?: number;
    organizerName: string;
    organizerPin: string;
  },
  now: Date,
): Promise<{ event: Event; organizer: Participant }> {
  const name = input.name.trim();
  if (!name) throw new DomainError("INVALID_EVENT_NAME", "이벤트 이름을 입력해 주세요.");
  const organizerName = normalizeName(input.organizerName);
  assertValidPin(input.organizerPin);
  const mission = validateSchedule(input, DEFAULT_MISSIONS.length, now);
  const pinHash = await hashPin(input.organizerPin);

  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        code: generateCode(),
        name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...mission,
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
  input: ScheduleInput & { name: string },
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
    const mission = validateSchedule(input, templates.length, now);
    const [updated] = await tx
      .update(events)
      .set({
        name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...mission,
        startMissedAt: null,
      })
      .where(eq(events.id, event.id))
      .returning();
    return updated;
  });
}
