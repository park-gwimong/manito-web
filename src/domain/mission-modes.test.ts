import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, missionDeliveries, type Participant } from "@/db/schema";
import { createEvent, updateEventSettings } from "./events";
import { advanceEvent, changeEndsAt, startNow } from "./lifecycle";
import type { MissionMode } from "./mission-plan";
import { deleteTemplate, listTemplates } from "./missions";
import { joinEvent } from "./participants";

const kst = (s: string) => new Date(`${s}:00+09:00`);
const now = kst("2026-11-30T12:00");
const startsAt = kst("2026-12-01T09:00");
const endsAt = kst("2026-12-08T09:00");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(missionMode: MissionMode, missionHour = 9) {
  const { event, organizer } = await createEvent(
    db,
    { name: "테스트", startsAt, endsAt, missionCount: 0, missionMode, missionHour, organizerName: "개설자", organizerPin: "0000" },
    now,
  );
  const members: Participant[] = [organizer];
  for (let i = 1; i < 4; i++) members.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, now));
  return { event, organizer, members };
}
const load = async (id: string) => (await db.select().from(events).where(eq(events.id, id)))[0];
const mine = async (eventId: string, participantId: string) =>
  (await db.select().from(missionDeliveries).where(eq(missionDeliveries.eventId, eventId)))
    .filter((d) => d.participantId === participantId)
    .sort((a, b) => a.slotIndex - b.slotIndex);

test("매일 방식: 개수는 일정에서 정해지고, 매일 정한 시각에 하나씩 도착한다", async () => {
  const { event, members } = await setup("daily", 8);
  expect(event.missionMode).toBe("daily");
  expect(event.missionHour).toBe(8);
  expect(event.missionCount).toBe(7); // 12/1 시작 + 12/2~12/7 08:00 (12/8 08:00은 종료 1시간 전이라 빠진다)

  await advanceEvent(db, event.id, kst("2026-12-01T09:01"));
  expect(await mine(event.id, members[1].id)).toHaveLength(1);

  // 다음 날 도착 시각 전에는 그대로, 지나면 하나 더
  await advanceEvent(db, event.id, kst("2026-12-02T07:59"));
  expect(await mine(event.id, members[1].id)).toHaveLength(1);
  await advanceEvent(db, event.id, kst("2026-12-02T08:00"));
  const got = await mine(event.id, members[1].id);
  expect(got).toHaveLength(2);
  expect(got[1].deliveredAt).toEqual(kst("2026-12-02T08:00"));
  expect(new Set(got.map((d) => d.body)).size).toBe(2);
});

test("이틀 방식과 직접 정하기", async () => {
  const alt = await setup("alternate");
  expect(alt.event.missionCount).toBe(4);

  const { event: custom } = await createEvent(
    db,
    { name: "직접", startsAt, endsAt, missionCount: 3, missionMode: "custom", organizerName: "개설자", organizerPin: "0000" },
    now,
  );
  expect(custom.missionMode).toBe("custom");
  expect(custom.missionCount).toBe(3);
});

test("방식이나 도착 시각이 잘못되면 거절한다", async () => {
  const base = { name: "x", startsAt, endsAt, missionCount: 0, organizerName: "개설자", organizerPin: "0000" };
  await expect(createEvent(db, { ...base, missionMode: "weekly" as MissionMode }, now)).rejects.toMatchObject({
    code: "BAD_MISSION_MODE",
  });
  await expect(createEvent(db, { ...base, missionMode: "daily", missionHour: 24 }, now)).rejects.toMatchObject({
    code: "BAD_MISSION_HOUR",
  });
});

test("설정에서 방식을 바꾸면 개수도 다시 정해진다", async () => {
  const { event, organizer } = await setup("daily");
  expect(event.missionCount).toBe(7);
  const changed = await updateEventSettings(
    db,
    organizer.id,
    { name: "테스트", startsAt, endsAt, missionCount: 2, missionMode: "custom" },
    now,
  );
  expect(changed.missionMode).toBe("custom");
  expect(changed.missionCount).toBe(2);
});

test("지금 시작하기와 종료 일시 변경에 맞춰 개수가 바뀐다", async () => {
  const { event, organizer, members } = await setup("daily");
  // 하루 일찍 시작: 11/30 12:00 시작 + 12/1~12/7 09:00
  await startNow(db, organizer.id, now);
  expect((await load(event.id)).missionCount).toBe(8);

  // 이틀 줄이면 12/5까지: 시작 + 12/1~12/5
  await changeEndsAt(db, organizer.id, kst("2026-12-06T09:00"), kst("2026-12-01T10:00"));
  expect((await load(event.id)).missionCount).toBe(6);

  // 이미 도착한 미션은 그대로 있고, 늘린 기간에도 매일 하나씩 온다.
  const before = await mine(event.id, members[1].id);
  expect(before).toHaveLength(2);
  await changeEndsAt(db, organizer.id, kst("2026-12-10T09:00"), kst("2026-12-01T10:00"));
  expect((await load(event.id)).missionCount).toBe(10);
  await advanceEvent(db, event.id, kst("2026-12-03T09:00"));
  const after = await mine(event.id, members[1].id);
  expect(after).toHaveLength(4);
  expect(after.slice(0, 2).map((d) => d.id)).toEqual(before.map((d) => d.id));
});

test("매일 방식에서는 미션 목록이 하나라도 남으면 지울 수 있다", async () => {
  const { event, organizer } = await setup("daily");
  const all = await listTemplates(db, event.id);
  for (const t of all.slice(1)) await deleteTemplate(db, organizer.id, t.id, now);
  await expect(deleteTemplate(db, organizer.id, all[0].id, now)).rejects.toMatchObject({ code: "TOO_FEW_TEMPLATES" });
  expect(await listTemplates(db, event.id)).toHaveLength(1);
});
