import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { missionDeliveries, type Event, type Participant } from "@/db/schema";
import { createEvent } from "./events";
import { joinEvent } from "./participants";
import { advanceEvent } from "./lifecycle";
import {
  addTemplate,
  completeMission,
  deleteTemplate,
  listTemplates,
  slotTime,
  updateTemplate,
} from "./missions";

const now = new Date("2026-11-24T00:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const startsAt = days(1);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(missionCount: number, durationDays = 10, people = 4) {
  const { event, organizer } = await createEvent(
    db,
    {
      name: "테스트",
      startsAt,
      endsAt: days(1 + durationDays),
      missionCount,
      organizerName: "개설자",
      organizerPin: "0000",
    },
    now,
  );
  const members: Participant[] = [organizer];
  for (let i = 1; i < people; i++) {
    members.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, now));
  }
  return { event, organizer, members };
}
const deliveriesOf = (eventId: string) =>
  db.select().from(missionDeliveries).where(eq(missionDeliveries.eventId, eventId));

test("slotTime: 10일 기간에 5개면 0, 2, 4, 6, 8일째", () => {
  const event = { startsAt, endsAt: days(11), missionCount: 5 };
  expect([0, 1, 2, 3, 4].map((i) => slotTime(event, i).getTime())).toEqual(
    [0, 2, 4, 6, 8].map((d) => days(1 + d).getTime()),
  );
});

test("시작 직후 각 참가자에게 0번 미션이 하나씩", async () => {
  const { event, members } = await setup(5);
  await advanceEvent(db, event.id, startsAt);
  const rows = await deliveriesOf(event.id);
  expect(rows).toHaveLength(members.length);
  expect(rows.every((r) => r.slotIndex === 0)).toBe(true);
  expect(new Set(rows.map((r) => r.participantId)).size).toBe(members.length);
  expect(rows.every((r) => r.deliveredAt.getTime() === startsAt.getTime())).toBe(true);
});

test("한 사람이 받은 미션 본문은 서로 다르다 (N=30, 템플릿 30)", async () => {
  const { event, members } = await setup(30, 30);
  await advanceEvent(db, event.id, days(100));
  const rows = await deliveriesOf(event.id);
  expect(rows).toHaveLength(30 * members.length);
  for (const m of members) {
    const bodies = rows.filter((r) => r.participantId === m.id).map((r) => r.body);
    expect(new Set(bodies).size).toBe(30);
  }
});

test("advanceEvent를 두 번 불러도 슬롯당 한 건", async () => {
  const { event, members } = await setup(5);
  await advanceEvent(db, event.id, days(3));
  await advanceEvent(db, event.id, days(3));
  await Promise.all([advanceEvent(db, event.id, days(3)), advanceEvent(db, event.id, days(3))]);
  // 0번(1일째)과 1번(3일째) 슬롯
  expect(await deliveriesOf(event.id)).toHaveLength(2 * members.length);
});

test("종료 후 첫 호출이면 참가자마다 N건이 모두 배달되고 상태는 closed", async () => {
  const { event, members } = await setup(5);
  const after = await advanceEvent(db, event.id, days(30));
  expect(after.status).toBe("closed");
  const rows = await deliveriesOf(event.id);
  expect(rows).toHaveLength(5 * members.length);
  for (const m of members) {
    expect(rows.filter((r) => r.participantId === m.id).map((r) => r.slotIndex).sort()).toEqual([0, 1, 2, 3, 4]);
  }
});

test("missionCount 0이면 배달 없음", async () => {
  const { event } = await setup(0);
  await advanceEvent(db, event.id, days(3));
  expect(await deliveriesOf(event.id)).toHaveLength(0);
  expect((await advanceEvent(db, event.id, days(30))).status).toBe("closed");
});

test("completeMission: 본인 것을 완료하고 다시 불러도 처음 시각을 유지", async () => {
  const { event, members } = await setup(5);
  await advanceEvent(db, event.id, startsAt);
  const mine = (await deliveriesOf(event.id)).find((r) => r.participantId === members[1].id)!;
  const t1 = days(2);
  await completeMission(db, members[1].id, mine.id, t1);
  await completeMission(db, members[1].id, mine.id, days(3));
  const [row] = await db.select().from(missionDeliveries).where(eq(missionDeliveries.id, mine.id));
  expect(row.completedAt?.getTime()).toBe(t1.getTime());
});

test("남의 미션 완료는 NOT_YOURS", async () => {
  const { event, members } = await setup(5);
  await advanceEvent(db, event.id, startsAt);
  const other = (await deliveriesOf(event.id)).find((r) => r.participantId === members[2].id)!;
  await expect(completeMission(db, members[1].id, other.id, days(2))).rejects.toMatchObject({
    code: "NOT_YOURS",
  });
});

test("마감 후 미션 완료는 NOT_ACTIVE", async () => {
  const { event, members } = await setup(5);
  await advanceEvent(db, event.id, startsAt);
  const mine = (await deliveriesOf(event.id)).find((r) => r.participantId === members[1].id)!;
  await expect(completeMission(db, members[1].id, mine.id, days(30))).rejects.toMatchObject({
    code: "NOT_ACTIVE",
  });
});

test("템플릿을 missionCount 아래로 지우면 TOO_FEW_TEMPLATES", async () => {
  const { organizer, event } = await setup(30);
  const [first] = await listTemplates(db, event.id);
  await expect(deleteTemplate(db, organizer.id, first.id, now)).rejects.toMatchObject({
    code: "TOO_FEW_TEMPLATES",
  });
  expect(await listTemplates(db, event.id)).toHaveLength(30);
});

test("템플릿 추가/수정/삭제 (개수 여유가 있을 때)", async () => {
  const { organizer, event } = await setup(5);
  const added = await addTemplate(db, organizer.id, "  새 미션  ", now);
  expect(added.body).toBe("새 미션");
  await updateTemplate(db, organizer.id, added.id, "고친 미션", now);
  expect((await listTemplates(db, event.id)).find((t) => t.id === added.id)?.body).toBe("고친 미션");
  await deleteTemplate(db, organizer.id, added.id, now);
  expect((await listTemplates(db, event.id)).some((t) => t.id === added.id)).toBe(false);
});

test("템플릿 본문 검증, 개설자/준비 중 제한", async () => {
  const { organizer, members, event } = await setup(5);
  await expect(addTemplate(db, organizer.id, "   ", now)).rejects.toMatchObject({ code: "INVALID_BODY" });
  await expect(addTemplate(db, organizer.id, "가".repeat(501), now)).rejects.toMatchObject({
    code: "INVALID_BODY",
  });
  await expect(addTemplate(db, members[1].id, "미션", now)).rejects.toMatchObject({ code: "NOT_ORGANIZER" });
  await expect(addTemplate(db, organizer.id, "미션", startsAt)).rejects.toMatchObject({
    code: "NOT_PREPARING",
  });
  expect(event.id).toBeTruthy();
});

test("다른 이벤트의 템플릿은 수정/삭제할 수 없다", async () => {
  const a = await setup(5);
  const b = await setup(5);
  const [foreign] = await listTemplates(db, b.event.id);
  await expect(updateTemplate(db, a.organizer.id, foreign.id, "탈취", now)).rejects.toMatchObject({
    code: "TEMPLATE_NOT_FOUND",
  });
  await expect(deleteTemplate(db, a.organizer.id, foreign.id, now)).rejects.toMatchObject({
    code: "TEMPLATE_NOT_FOUND",
  });
  expect((await listTemplates(db, b.event.id)).find((t) => t.id === foreign.id)?.body).not.toBe("탈취");
});
