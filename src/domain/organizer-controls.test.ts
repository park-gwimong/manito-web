import { beforeAll, beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import {
  assignments,
  missionDeliveries,
  notifications,
  records,
  secretDeeds,
  type Event,
  type Participant,
} from "@/db/schema";
import { createEvent } from "./events";
import { advanceEvent, changeEndsAt, closeNow, getGiverIdOf, getTargetOf, startNow } from "./lifecycle";
import { saveSubscription, takePending } from "./notifications";
import { joinEvent, removeParticipant } from "./participants";
import { addSecretDeed, createRecord, setVerdict } from "./records";
import { startPresentation } from "./reveal";
import { getDuty } from "./views";

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
  await db.delete(notifications);
  ({ event, organizer } = await createEvent(
    db,
    { name: "테스트", startsAt, endsAt, missionCount: 4, organizerName: "개설자", organizerPin: "0000" },
    now,
  ));
});

let joined = 0;
async function join(n: number) {
  const people: Participant[] = [];
  for (let i = 0; i < n; i++) {
    people.push(await joinEvent(db, event.id, { name: `참가자${joined++}`, pin: "1234" }, now));
  }
  return people;
}
const chainOf = () => db.select().from(assignments).where(eq(assignments.eventId, event.id));
const pendingOf = () => db.select().from(notifications).where(eq(notifications.eventId, event.id));

/** 배정이 고리 하나인지: 한 사람에서 출발해 모두를 거쳐 돌아온다. */
async function expectSingleCycle(size: number) {
  const chain = await chainOf();
  expect(chain).toHaveLength(size);
  const next = new Map(chain.map((a) => [a.giverId, a.receiverId]));
  let at = chain[0].giverId;
  const seen = new Set<string>();
  while (!seen.has(at)) {
    seen.add(at);
    at = next.get(at)!;
  }
  expect(seen.size).toBe(size);
}

// ---- 지금 시작 ----

test("지금 시작: 시작 시각 전이라도 4명이면 바로 진행으로 바뀌고 첫 미션이 온다", async () => {
  await join(3);
  const at = hours(2);
  await startNow(db, organizer.id, at);
  const started = await advanceEvent(db, event.id, at);
  expect(started.status).toBe("active");
  expect(started.startsAt.getTime()).toBe(at.getTime());
  await expectSingleCycle(4);
  const first = await db.select().from(missionDeliveries).where(eq(missionDeliveries.eventId, event.id));
  expect(first).toHaveLength(4);
  expect((await pendingOf()).map((n) => n.kind)).toEqual(["started", "started", "started", "started"]);
});

test("지금 시작: 인원이 모자라면 거부하고 준비 상태로 남는다", async () => {
  await join(2);
  await expect(startNow(db, organizer.id, hours(2))).rejects.toMatchObject({ code: "NOT_ENOUGH_PARTICIPANTS" });
  const still = await advanceEvent(db, event.id, hours(2));
  expect(still.status).toBe("preparing");
  expect(still.startsAt.getTime()).toBe(startsAt.getTime());
});

test("지금 시작: 개설자만, 준비 중일 때만", async () => {
  const [p] = await join(3);
  await expect(startNow(db, p.id, hours(2))).rejects.toMatchObject({ code: "NOT_ORGANIZER" });
  await startNow(db, organizer.id, hours(2));
  await expect(startNow(db, organizer.id, hours(3))).rejects.toMatchObject({ code: "NOT_PREPARING" });
});

test("지금 시작: 인원 부족으로 시작을 놓친 뒤에도 사람이 모이면 시작할 수 있다", async () => {
  await join(2);
  await advanceEvent(db, event.id, hours(25));
  await join(1);
  await startNow(db, organizer.id, hours(26));
  expect((await advanceEvent(db, event.id, hours(26))).status).toBe("active");
});

// ---- 종료 일시 변경, 지금 마감 ----

test("종료 일시 연장: 원래 종료 시각이 지나도 진행 중이다", async () => {
  await join(3);
  await advanceEvent(db, event.id, startsAt);
  await changeEndsAt(db, organizer.id, hours(24 * 9), hours(48));
  expect((await advanceEvent(db, event.id, hours(24 * 6))).status).toBe("active");
  expect((await advanceEvent(db, event.id, hours(24 * 9))).status).toBe("closed");
});

test("종료 일시 변경: 과거 시각, 개설자가 아닌 사람, 진행 중이 아닐 때는 거부", async () => {
  const [p] = await join(3);
  await expect(changeEndsAt(db, organizer.id, hours(24 * 9), hours(2))).rejects.toMatchObject({ code: "NOT_ACTIVE" });
  await advanceEvent(db, event.id, startsAt);
  await expect(changeEndsAt(db, organizer.id, hours(30), hours(48))).rejects.toMatchObject({ code: "END_IN_PAST" });
  await expect(changeEndsAt(db, p.id, hours(24 * 9), hours(48))).rejects.toMatchObject({ code: "NOT_ORGANIZER" });
});

test("지금 마감: 마감으로 바뀌고, 남은 미션은 배달되지 않고, 모두에게 알린다", async () => {
  await join(3);
  await advanceEvent(db, event.id, startsAt);
  await db.delete(notifications);
  await closeNow(db, organizer.id, hours(30));
  const closed = await advanceEvent(db, event.id, hours(24 * 6));
  expect(closed.status).toBe("closed");
  expect(closed.endsAt.getTime()).toBe(hours(30).getTime());
  const delivered = await db.select().from(missionDeliveries).where(eq(missionDeliveries.eventId, event.id));
  expect(new Set(delivered.map((d) => d.slotIndex))).toEqual(new Set([0]));
  expect((await pendingOf()).map((n) => n.kind)).toEqual(["closed", "closed", "closed", "closed"]);
  await expect(closeNow(db, organizer.id, hours(31))).rejects.toMatchObject({ code: "NOT_ACTIVE" });
});

// ---- 진행 중 내보내기 ----

test("진행 중 내보내기: 마니또가 나간 사람의 대상을 이어받고 고리는 하나로 남는다", async () => {
  const people = await join(4);
  await advanceEvent(db, event.id, startsAt);
  const leaving = people[0];
  const giverId = (await getGiverIdOf(db, leaving.id))!;
  const nextTarget = (await getTargetOf(db, leaving.id))!;
  await createRecord(db, leaving.id, "나갈 사람의 기록", hours(30));
  await addSecretDeed(db, giverId, "나갈 사람에게 한 일", hours(30));
  // 나갈 사람이 자기 대상의 기록에 남긴 답은, 대상을 이어받는 사람의 답이 아니다.
  const inherited = await createRecord(db, nextTarget.id, "이어받을 대상의 기록", hours(30));
  await setVerdict(db, leaving.id, inherited.id, true, hours(31));
  await db.delete(notifications);

  await removeParticipant(db, organizer.id, leaving.id, hours(40));

  await expectSingleCycle(4);
  expect((await getTargetOf(db, giverId))!.id).toBe(nextTarget.id);
  const [moved] = (await chainOf()).filter((a) => a.giverId === giverId);
  expect(moved.reassignedAt?.getTime()).toBe(hours(40).getTime());
  // 나간 사람의 기록과, 그 사람을 두고 적은 메모는 사라진다.
  expect((await db.select().from(records).where(eq(records.eventId, event.id))).map((r) => r.id)).toEqual([inherited.id]);
  expect((await getDuty(db, event.id, giverId))!.targetRecords[0].judge).toEqual({ myVerdict: null });
  expect(await db.select().from(secretDeeds).where(eq(secretDeeds.giverId, giverId))).toHaveLength(0);
  // 대상이 바뀐 사람에게만 알린다.
  expect(await pendingOf()).toMatchObject([{ participantId: giverId, kind: "reassigned" }]);
  expect((await getDuty(db, event.id, giverId))!.reassigned).toBe(true);
  const untouched = (await chainOf()).find((a) => a.giverId !== giverId)!;
  expect((await getDuty(db, event.id, untouched.giverId))!.reassigned).toBe(false);
});

test("진행 중 내보내기: 3명 아래로는 줄일 수 없고, 개설자는 내보낼 수 없다", async () => {
  const people = await join(3);
  await advanceEvent(db, event.id, startsAt);
  await removeParticipant(db, organizer.id, people[0].id, hours(30));
  await expectSingleCycle(3);
  await expect(removeParticipant(db, organizer.id, people[1].id, hours(31))).rejects.toMatchObject({
    code: "TOO_FEW_PARTICIPANTS",
  });
  await expect(removeParticipant(db, organizer.id, organizer.id, hours(31))).rejects.toMatchObject({
    code: "CANNOT_REMOVE_ORGANIZER",
  });
});

test("마감 뒤에는 내보낼 수 없다", async () => {
  const people = await join(4);
  await advanceEvent(db, event.id, endsAt);
  await expect(removeParticipant(db, organizer.id, people[0].id, hours(24 * 6))).rejects.toMatchObject({
    code: "NOT_REMOVABLE",
  });
});

// ---- 알림 ----

test("기록을 쓰면 글쓴이의 마니또에게만 알림이 쌓인다", async () => {
  const people = await join(3);
  await advanceEvent(db, event.id, startsAt);
  await db.delete(notifications);
  const author = people[0];
  const giverId = (await getGiverIdOf(db, author.id))!;
  const r = await createRecord(db, author.id, "기록", hours(30));
  await setVerdict(db, giverId, r.id, true, hours(31));
  expect(await pendingOf()).toMatchObject([{ participantId: giverId, kind: "record" }]);
});

test("미션이 도착하면 받은 사람에게 알리고, 발표 시작은 개설자를 뺀 모두에게 알린다", async () => {
  await join(3);
  await advanceEvent(db, event.id, startsAt);
  await db.delete(notifications);
  await advanceEvent(db, event.id, hours(24 * 2 + 1)); // 두 번째 미션 시각이 지남
  expect((await pendingOf()).map((n) => n.kind)).toEqual(["mission", "mission", "mission", "mission"]);
  await db.delete(notifications);
  await advanceEvent(db, event.id, endsAt);
  await db.delete(notifications);
  await startPresentation(db, organizer.id, hours(24 * 6));
  const pending = await pendingOf();
  expect(pending).toHaveLength(3);
  expect(pending.every((n) => n.kind === "presentation" && n.participantId !== organizer.id)).toBe(true);
});

test("takePending: 알림을 켠 브라우저로만 보내고, 글귀에 참가자 이름이 없고, 한 번 꺼내면 비워진다", async () => {
  const people = await join(3);
  await advanceEvent(db, event.id, startsAt);
  await db.delete(notifications);
  const author = people[0];
  const giverId = (await getGiverIdOf(db, author.id))!;
  await saveSubscription(db, giverId, { endpoint: "https://push.example/a", p256dh: "k", auth: "a" });
  await saveSubscription(db, giverId, { endpoint: "https://push.example/a", p256dh: "k2", auth: "a2" });
  await createRecord(db, author.id, "기록 하나", hours(30));
  await createRecord(db, author.id, "기록 둘", hours(31));

  const out = await takePending(db);
  expect(out).toHaveLength(1);
  expect(out[0].subscription).toEqual({ endpoint: "https://push.example/a", p256dh: "k2", auth: "a2" });
  expect(out[0].title).toBe("테스트");
  expect(out[0].url).toBe(`/e/${event.code}/duty`);
  for (const p of [...people, organizer]) expect(out[0].body).not.toContain(p.name);
  expect(await takePending(db)).toEqual([]);
});

test("알림 주소는 https만 받는다", async () => {
  await expect(
    saveSubscription(db, organizer.id, { endpoint: "http://push.example/a", p256dh: "k", auth: "a" }),
  ).rejects.toMatchObject({ code: "INVALID_SUBSCRIPTION" });
});
