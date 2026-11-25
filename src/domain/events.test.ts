import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, missionTemplates, participants } from "@/db/schema";
import { DEFAULT_MISSIONS } from "./default-missions";
import { createEvent, getEventByCode, updateEventSettings, validateSchedule } from "./events";
import { DomainError } from "./errors";

const now = new Date("2026-11-24T00:00:00Z");
const startsAt = new Date("2026-11-25T00:00:00Z");
const endsAt = new Date("2026-11-30T00:00:00Z");
const base = { name: "연말 마니또", startsAt, endsAt, missionCount: 5, organizerName: "개설자", organizerPin: "1234" };

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function codeOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : e;
  }
  return null;
}

test("기본 미션은 정확히 30개", () => {
  expect(DEFAULT_MISSIONS).toHaveLength(60);
  expect(new Set(DEFAULT_MISSIONS).size).toBe(60);
});

test("개설하면 준비 상태, 개설자 1명, 미션 목록 60개", async () => {
  const { event, organizer } = await createEvent(db, base, now);
  expect(event.status).toBe("preparing");
  expect(event.code).toMatch(/^[A-Z0-9]{8}$/);
  expect(organizer.isOrganizer).toBe(true);
  expect(organizer.pinHash).not.toBe("1234");
  const ps = await db.select().from(participants).where(eq(participants.eventId, event.id));
  expect(ps).toHaveLength(1);
  const ms = await db.select().from(missionTemplates).where(eq(missionTemplates.eventId, event.id));
  expect(ms).toHaveLength(60);
  expect((await getEventByCode(db, event.code))?.id).toBe(event.id);
  expect(await getEventByCode(db, "NOPE0000")).toBeNull();
});

test("종료가 시작보다 이르면 END_BEFORE_START", () => {
  expect(() => validateSchedule({ startsAt, endsAt: startsAt, missionCount: 1 }, 30, now)).toThrowError(
    expect.objectContaining({ code: "END_BEFORE_START" }),
  );
});

test("시작이 과거면 START_IN_PAST", async () => {
  expect(await codeOf(() => createEvent(db, { ...base, startsAt: now }, now))).toBe("START_IN_PAST");
});

test("missionCount 31이면 BAD_MISSION_COUNT", () => {
  expect(() => validateSchedule({ startsAt, endsAt, missionCount: 31 }, 30, now)).toThrowError(
    expect.objectContaining({ code: "BAD_MISSION_COUNT" }),
  );
  expect(() => validateSchedule({ startsAt, endsAt, missionCount: -1 }, 30, now)).toThrowError(
    expect.objectContaining({ code: "BAD_MISSION_COUNT" }),
  );
});

test("설정을 바꾸면 startMissedAt이 지워진다", async () => {
  const { event, organizer } = await createEvent(db, base, now);
  await db.update(events).set({ startMissedAt: now }).where(eq(events.id, event.id));
  const newEnd = new Date("2026-12-05T00:00:00Z");
  const updated = await updateEventSettings(
    db,
    organizer.id,
    { name: "새 이름", startsAt, endsAt: newEnd, missionCount: 7 },
    now,
  );
  expect(updated.startMissedAt).toBeNull();
  expect(updated.name).toBe("새 이름");
  expect(updated.missionCount).toBe(7);
});

test("개설자가 아니거나 준비 상태가 아니면 설정을 바꿀 수 없다", async () => {
  const { event, organizer } = await createEvent(db, base, now);
  const [other] = await db
    .insert(participants)
    .values({ eventId: event.id, name: "참가자", pinHash: "x" })
    .returning();
  const input = { name: "x", startsAt, endsAt, missionCount: 1 };
  expect(await codeOf(() => updateEventSettings(db, other.id, input, now))).toBe("NOT_ORGANIZER");
  await db.update(events).set({ status: "active" }).where(eq(events.id, event.id));
  expect(await codeOf(() => updateEventSettings(db, organizer.id, input, now))).toBe("NOT_PREPARING");
});
