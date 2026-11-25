import { beforeAll, beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { assignments, type Event, type Participant } from "@/db/schema";
import { createEvent, updateEventSettings } from "./events";
import { joinEvent, removeParticipant } from "./participants";
import { advanceEvent, buildChain, getGiverIdOf, getTargetOf } from "./lifecycle";

const now = new Date("2026-11-24T00:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const startsAt = hours(24);
const endsAt = hours(24 * 5);

let db: Db;
let event: Event;
let organizer: Participant;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  ({ event, organizer } = await createEvent(
    db,
    { name: "테스트", startsAt, endsAt, missionCount: 3, organizerName: "개설자", organizerPin: "0000" },
    now,
  ));
});

async function join(n: number, at: Date = now) {
  const people: Participant[] = [];
  for (let i = 0; i < n; i++) {
    people.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, at));
  }
  return people;
}
const assignmentsOf = (id: string) => db.select().from(assignments).where(eq(assignments.eventId, id));

test("buildChain: 5명이면 5쌍, 모두 한 번씩 주고받고, 자기 자신 없음, 고리 하나", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const chain = buildChain(ids, Math.random);
  expect(chain).toHaveLength(5);
  expect(chain.map((c) => c.giverId).sort()).toEqual(ids);
  expect(chain.map((c) => c.receiverId).sort()).toEqual(ids);
  expect(chain.every((c) => c.giverId !== c.receiverId)).toBe(true);
  const next = new Map(chain.map((c) => [c.giverId, c.receiverId]));
  let cur = chain[0].giverId;
  for (let step = 1; step <= 5; step++) {
    cur = next.get(cur)!;
    if (step < 5) expect(cur).not.toBe(chain[0].giverId);
  }
  expect(cur).toBe(chain[0].giverId);
});

test("buildChain: 4명에서 서로 마니또인 쌍이 없다", () => {
  for (let trial = 0; trial < 50; trial++) {
    const chain = buildChain(["a", "b", "c", "d"], Math.random);
    const next = new Map(chain.map((c) => [c.giverId, c.receiverId]));
    for (const [g, r] of next) expect(next.get(r)).not.toBe(g);
  }
});

test("없는 이벤트면 EVENT_NOT_FOUND", async () => {
  await expect(advanceEvent(db, "00000000-0000-0000-0000-000000000000", now)).rejects.toMatchObject({
    code: "EVENT_NOT_FOUND",
  });
});

test("시작 전에는 아무 일도 없다", async () => {
  await join(3);
  const result = await advanceEvent(db, event.id, hours(23));
  expect(result.status).toBe("preparing");
  expect(result.startMissedAt).toBeNull();
  expect(await assignmentsOf(event.id)).toHaveLength(0);
});

test("4명이고 시작 시각이 되면 active, 배정 4건", async () => {
  await join(3);
  const result = await advanceEvent(db, event.id, startsAt);
  expect(result.status).toBe("active");
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});

test("3명이고 시작 시각이 지나면 preparing 유지, startMissedAt 기록", async () => {
  await join(2);
  const at = hours(25);
  const result = await advanceEvent(db, event.id, at);
  expect(result.status).toBe("preparing");
  expect(result.startMissedAt).toEqual(at);
  expect(await assignmentsOf(event.id)).toHaveLength(0);
});

test("startMissedAt 이후 4번째가 입장해도 advanceEvent는 시작하지 않는다", async () => {
  await join(2);
  await advanceEvent(db, event.id, hours(25));
  await joinEvent(db, event.id, { name: "늦은사람", pin: "1234" }, hours(26));
  const result = await advanceEvent(db, event.id, hours(27));
  expect(result.status).toBe("preparing");
  expect(await assignmentsOf(event.id)).toHaveLength(0);
});

test("개설자가 시작 일시를 다시 정하면 그 시각에 시작한다", async () => {
  await join(2);
  await advanceEvent(db, event.id, hours(25));
  await joinEvent(db, event.id, { name: "늦은사람", pin: "1234" }, hours(26));
  const newStart = hours(30);
  const updated = await updateEventSettings(
    db,
    organizer.id,
    { name: "테스트", startsAt: newStart, endsAt, missionCount: 3 },
    hours(26),
  );
  expect(updated.startMissedAt).toBeNull();
  expect((await advanceEvent(db, event.id, hours(29))).status).toBe("preparing");
  const result = await advanceEvent(db, event.id, newStart);
  expect(result.status).toBe("active");
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});

test("advanceEvent를 두 번 불러도 배정은 4건", async () => {
  await join(3);
  await advanceEvent(db, event.id, startsAt);
  const again = await advanceEvent(db, event.id, startsAt);
  expect(again.status).toBe("active");
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});

test("Promise.all로 동시에 두 번 불러도 배정은 4건", async () => {
  await join(3);
  const [a, b] = await Promise.all([
    advanceEvent(db, event.id, startsAt),
    advanceEvent(db, event.id, startsAt),
  ]);
  expect(a.status).toBe("active");
  expect(b.status).toBe("active");
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});

test("종료 시각이 지나면 closed", async () => {
  await join(3);
  await advanceEvent(db, event.id, startsAt);
  expect((await advanceEvent(db, event.id, hours(24 * 5 - 1))).status).toBe("active");
  expect((await advanceEvent(db, event.id, endsAt)).status).toBe("closed");
  expect((await advanceEvent(db, event.id, hours(24 * 6))).status).toBe("closed");
});

test("시작 전부터 종료 후까지 아무도 안 왔다가 한 번 부르면 closed이고 배정은 있다", async () => {
  await join(3);
  const result = await advanceEvent(db, event.id, hours(24 * 6));
  expect(result.status).toBe("closed");
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});

test("getTargetOf / getGiverIdOf는 배정을 따라간다", async () => {
  await join(3);
  expect(await getTargetOf(db, organizer.id)).toBeNull();
  await advanceEvent(db, event.id, startsAt);
  const target = await getTargetOf(db, organizer.id);
  expect(target).not.toBeNull();
  expect(target!.id).not.toBe(organizer.id);
  expect(await getGiverIdOf(db, target!.id)).toBe(organizer.id);
});

test("시작 뒤 입장은 NOT_PREPARING이고, 배정은 시작 시점 참가자만 정확히 포함한다", async () => {
  const people = await join(3);
  await advanceEvent(db, event.id, startsAt);
  await expect(
    joinEvent(db, event.id, { name: "늦은사람", pin: "1234" }, startsAt),
  ).rejects.toMatchObject({ code: "NOT_PREPARING" });
  const rows = await assignmentsOf(event.id);
  const expected = [organizer.id, ...people.map((p) => p.id)].sort();
  expect(rows.map((r) => r.giverId).sort()).toEqual(expected);
  expect(rows.map((r) => r.receiverId).sort()).toEqual(expected);
});

test("마감 뒤 내보내기는 NOT_REMOVABLE이고 배정은 그대로", async () => {
  const people = await join(3);
  await advanceEvent(db, event.id, endsAt);
  await expect(removeParticipant(db, organizer.id, people[0].id)).rejects.toMatchObject({
    code: "NOT_REMOVABLE",
  });
  expect(await assignmentsOf(event.id)).toHaveLength(4);
});
