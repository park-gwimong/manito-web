import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, participants, type Event, type Participant } from "@/db/schema";
import { createEvent } from "./events";
import { DomainError } from "./errors";
import {
  acknowledgePinReset,
  joinEvent,
  loginWithPin,
  removeParticipant,
  resetOrganizerPin,
  resetPin,
  setNewPin,
  verifyAdminPassword,
} from "./participants";

const now = new Date("2026-11-24T00:00:00Z");
const minutes = (m: number) => new Date(now.getTime() + m * 60_000);

let db: Db;
let event: Event;
let organizer: Participant;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  ({ event, organizer } = await createEvent(
    db,
    {
      name: "테스트",
      startsAt: new Date("2026-11-25T00:00:00Z"),
      endsAt: new Date("2026-11-30T00:00:00Z"),
      missionCount: 3,
      organizerName: "개설자",
      organizerPin: "0000",
    },
    now,
  ));
});

const originalAdmin = process.env.ADMIN_PASSWORD;
afterEach(() => {
  if (originalAdmin === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalAdmin;
});

async function codeOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : e;
  }
  return null;
}

const get = async (id: string) =>
  (await db.select().from(participants).where(eq(participants.id, id)))[0];

test("이름 앞뒤 공백을 지우고 입장한다", async () => {
  const p = await joinEvent(db, event.id, { name: " 지민 ", pin: "1234" }, now);
  expect(p.name).toBe("지민");
  expect(p.isOrganizer).toBe(false);
  expect(p.pinHash).toBeTruthy();
});

test("공백뿐인 이름은 INVALID_NAME", async () => {
  expect(await codeOf(() => joinEvent(db, event.id, { name: "   ", pin: "1234" }, now))).toBe("INVALID_NAME");
  expect(await codeOf(() => joinEvent(db, event.id, { name: "가".repeat(21), pin: "1234" }, now))).toBe(
    "INVALID_NAME",
  );
});

test("'지민'이 있으면 ' 지민'도 NAME_TAKEN", async () => {
  await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  expect(await codeOf(() => joinEvent(db, event.id, { name: " 지민", pin: "1234" }, now))).toBe("NAME_TAKEN");
});

test("PIN이 12a4면 INVALID_PIN", async () => {
  expect(await codeOf(() => joinEvent(db, event.id, { name: "민수", pin: "12a4" }, now))).toBe("INVALID_PIN");
  expect(await codeOf(() => joinEvent(db, event.id, { name: "민수", pin: "12345" }, now))).toBe("INVALID_PIN");
});

test("준비 상태가 아니면 입장할 수 없다", async () => {
  await db.update(events).set({ status: "active" }).where(eq(events.id, event.id));
  expect(await codeOf(() => joinEvent(db, event.id, { name: "민수", pin: "1234" }, now))).toBe("NOT_PREPARING");
});

test("PIN 5번 틀리면 6번째는 맞아도 PIN_LOCKED, 5분 뒤에는 통과", async () => {
  const p = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  for (let i = 0; i < 5; i++) {
    expect(await codeOf(() => loginWithPin(db, p.id, "9999", now))).toBe("WRONG_PIN");
  }
  const locked = await get(p.id);
  expect(locked.failedPinAttempts).toBe(5);
  expect(locked.pinLockedUntil?.getTime()).toBe(minutes(5).getTime());
  expect(await codeOf(() => loginWithPin(db, p.id, "1234", minutes(1)))).toBe("PIN_LOCKED");
  const ok = await loginWithPin(db, p.id, "1234", minutes(5));
  expect(ok.failedPinAttempts).toBe(0);
  expect(ok.pinLockedUntil).toBeNull();
});

test("성공하면 실패 횟수가 0으로 돌아간다", async () => {
  const p = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  await codeOf(() => loginWithPin(db, p.id, "0000", now));
  expect((await get(p.id)).failedPinAttempts).toBe(1);
  await loginWithPin(db, p.id, "1234", now);
  expect((await get(p.id)).failedPinAttempts).toBe(0);
});

test("초기화하면 pinResetAt이 찍히고 기존 PIN으로 로그인 불가(PIN_RESET_REQUIRED)", async () => {
  const p = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  await resetPin(db, organizer.id, p.id, minutes(10));
  const after = await get(p.id);
  expect(after.pinHash).toBeNull();
  expect(after.pinResetAt?.getTime()).toBe(minutes(10).getTime());
  expect(await codeOf(() => loginWithPin(db, p.id, "1234", minutes(11)))).toBe("PIN_RESET_REQUIRED");

  const renewed = await setNewPin(db, p.id, "5678", minutes(11));
  expect(renewed.pinHash).toBeTruthy();
  await loginWithPin(db, p.id, "5678", minutes(12));
  expect(await codeOf(() => setNewPin(db, p.id, "1111", minutes(13)))).toBe("PIN_NOT_RESET");

  await acknowledgePinReset(db, p.id);
  expect((await get(p.id)).pinResetAt).toBeNull();
});

test("초기화는 잠금도 풀어 준다", async () => {
  const p = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  for (let i = 0; i < 5; i++) await codeOf(() => loginWithPin(db, p.id, "9999", now));
  await resetPin(db, organizer.id, p.id, now);
  const after = await get(p.id);
  expect(after.pinLockedUntil).toBeNull();
  expect(after.failedPinAttempts).toBe(0);
});

test("개설자가 아닌 사람의 resetPin·removeParticipant는 NOT_ORGANIZER", async () => {
  const a = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  const b = await joinEvent(db, event.id, { name: "민수", pin: "1234" }, now);
  expect(await codeOf(() => resetPin(db, a.id, b.id, now))).toBe("NOT_ORGANIZER");
  expect(await codeOf(() => removeParticipant(db, a.id, b.id))).toBe("NOT_ORGANIZER");
});

test("개설자는 참가자를 내보낼 수 있지만 자신은 못 내보내고, 시작 뒤에는 불가", async () => {
  const a = await joinEvent(db, event.id, { name: "지민", pin: "1234" }, now);
  expect(await codeOf(() => removeParticipant(db, organizer.id, organizer.id))).toBe(
    "CANNOT_REMOVE_ORGANIZER",
  );
  await removeParticipant(db, organizer.id, a.id);
  expect(await get(a.id)).toBeUndefined();
  const b = await joinEvent(db, event.id, { name: "민수", pin: "1234" }, now);
  await db.update(events).set({ status: "active" }).where(eq(events.id, event.id));
  expect(await codeOf(() => removeParticipant(db, organizer.id, b.id))).toBe("NOT_PREPARING");
});

test("관리 비밀번호가 틀리면 resetOrganizerPin은 WRONG_ADMIN_PASSWORD", async () => {
  process.env.ADMIN_PASSWORD = "secret-admin";
  expect(await codeOf(() => resetOrganizerPin(db, event.id, "wrong", now))).toBe("WRONG_ADMIN_PASSWORD");
  expect((await get(organizer.id)).pinHash).not.toBeNull();
  await resetOrganizerPin(db, event.id, "secret-admin", minutes(3));
  const after = await get(organizer.id);
  expect(after.pinHash).toBeNull();
  expect(after.pinResetAt?.getTime()).toBe(minutes(3).getTime());
});

test("verifyAdminPassword는 환경변수가 비면 항상 false", () => {
  process.env.ADMIN_PASSWORD = "";
  expect(verifyAdminPassword("")).toBe(false);
  delete process.env.ADMIN_PASSWORD;
  expect(verifyAdminPassword("anything")).toBe(false);
  process.env.ADMIN_PASSWORD = "pw";
  expect(verifyAdminPassword("pw")).toBe(true);
  expect(verifyAdminPassword("pw ")).toBe(false);
});
