import { beforeAll, expect, test } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { guesses, missionDeliveries, type Participant } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createEvent } from "./events";
import { joinEvent } from "./participants";
import { advanceEvent, getGiverIdOf, getTargetOf } from "./lifecycle";
import { completeMission } from "./missions";
import { addSecretDeed, createRecord, deleteRecord, setVerdict, toggleReaction } from "./records";
import { finalScores, kstDayKey, livePoints, temperature } from "./scoring";

const now = new Date("2026-11-24T00:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const startsAt = days(1);
const during = days(2);
const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(opts: { people?: number; durationDays?: number; missionCount?: number } = {}) {
  const { people = 4, durationDays = 10, missionCount = 5 } = opts;
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
  await advanceEvent(db, event.id, startsAt);
  return { event, members };
}

test("kstDayKey: UTC 2026-12-01T15:30Z는 2026-12-02", () => {
  expect(kstDayKey(new Date("2026-12-01T15:30:00Z"))).toBe("2026-12-02");
});

test("활동이 없으면 전원 0점, 온도 36.5", async () => {
  const { event, members } = await setup();
  const points = await livePoints(db, event.id);
  expect(points.size).toBe(members.length);
  expect([...points.values()]).toEqual([0, 0, 0, 0]);
  expect(await temperature(db, event)).toBe(36.5);
});

test("같은 날 기록 4건이면 30점, 다음 날 1건 더 쓰면 40점", async () => {
  const { event, members } = await setup();
  const a = members[0].id;
  for (let i = 0; i < 4; i++) await createRecord(db, a, `기록${i}`, minutes(during, i));
  expect((await livePoints(db, event.id)).get(a)).toBe(30);
  await createRecord(db, a, "다음 날", days(3));
  expect((await livePoints(db, event.id)).get(a)).toBe(40);
});

test("KST 자정 전후 기록은 서로 다른 날로 센다", async () => {
  const { event, members } = await setup();
  const a = members[0].id;
  const beforeMidnight = new Date("2026-11-30T14:59:00Z"); // KST 11-30 23:59
  const afterMidnight = new Date("2026-11-30T15:00:00Z"); // KST 12-01 00:00
  for (let i = 0; i < 3; i++) await createRecord(db, a, `전${i}`, minutes(beforeMidnight, -i));
  for (let i = 0; i < 3; i++) await createRecord(db, a, `후${i}`, minutes(afterMidnight, i));
  expect((await livePoints(db, event.id)).get(a)).toBe(60);
});

test("미션 2개 완료하면 +20", async () => {
  const { event, members } = await setup();
  await advanceEvent(db, event.id, days(5));
  const mine = (
    await db.select().from(missionDeliveries).where(eq(missionDeliveries.participantId, members[1].id))
  ).slice(0, 3);
  expect(mine.length).toBeGreaterThanOrEqual(3);
  await completeMission(db, members[1].id, mine[0].id, days(5));
  await completeMission(db, members[1].id, mine[1].id, days(5));
  const points = await livePoints(db, event.id);
  expect(points.get(members[1].id)).toBe(20);
  expect(points.get(members[0].id)).toBe(0);
});

test("판정이 내려져도 livePoints는 누구도 변하지 않는다", async () => {
  const { event, members } = await setup();
  const author = members[0];
  const { id } = await createRecord(db, author.id, "기록", during);
  const before = await livePoints(db, event.id);
  const manitoId = (await getGiverIdOf(db, author.id))!;
  await setVerdict(db, manitoId, id, true, days(3));
  expect(await livePoints(db, event.id)).toEqual(before);
});

test("점수 인정된 기록을 지우면 그날 4번째 기록이 점수를 받는다", async () => {
  const { event, members } = await setup();
  const a = members[0].id;
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push((await createRecord(db, a, `기록${i}`, minutes(during, i))).id);
  await deleteRecord(db, a, ids[0], minutes(during, 10));
  expect((await livePoints(db, event.id)).get(a)).toBe(30);
});

test("finalScores: 적중 2건, 인정 2건, 판정 3건, 몰래 한 일 1건, 추측 정답 → 각 40/40/15/5/50, total은 live와의 합", async () => {
  const { event, members } = await setup();
  const a = members[0];
  const giverId = (await getGiverIdOf(db, a.id))!;
  const target = (await getTargetOf(db, a.id))!;

  // a의 기록 2건을 a의 마니또가 모두 "내가 한 일"로 판정 -> a의 hit 40
  for (let i = 0; i < 2; i++) {
    const { id } = await createRecord(db, a.id, `내 기록${i}`, minutes(during, i));
    await setVerdict(db, giverId, id, true, days(3));
  }
  // a의 대상이 쓴 기록 3건을 a가 판정(2건 맞음, 1건 아님) -> a의 recognized 40, verdict 15
  for (let i = 0; i < 3; i++) {
    const { id } = await createRecord(db, target.id, `대상 기록${i}`, minutes(during, i));
    await setVerdict(db, a.id, id, i < 2, days(3));
  }
  await addSecretDeed(db, a.id, "몰래 청소", days(3));
  await db.insert(guesses).values({ participantId: a.id, guessedId: giverId });
  // 틀린 추측은 점수 없음
  const other = members.find((m) => m.id !== a.id && m.id !== giverId)!;
  await db.insert(guesses).values({ participantId: other.id, guessedId: other.id });

  const scores = await finalScores(db, event.id);
  const live = (await livePoints(db, event.id)).get(a.id)!;
  expect(live).toBe(20);
  expect(scores.get(a.id)).toEqual({
    live,
    hit: 40,
    recognized: 40,
    verdict: 15,
    secretDeed: 5,
    guess: 50,
    total: live + 40 + 40 + 15 + 5 + 50,
  });
  expect(scores.get(other.id)!.guess).toBe(0);
  expect(scores.size).toBe(members.length);
});

test("온도: 5명·10일·미션 5개(목표 125)에 활동 25건이면 49.2", async () => {
  const { event, members } = await setup({ people: 5 });
  for (let i = 0; i < 20; i++) await createRecord(db, members[i % 5].id, `기록${i}`, minutes(during, i));
  const [first] = await db.select().from(missionDeliveries).where(eq(missionDeliveries.participantId, members[0].id));
  await completeMission(db, members[0].id, first.id, during);
  // 기록 21 + 미션 1 + 반응 2 = 24건, 몰래 한 일 1건을 더하면 25건
  const { id: recordId } = await createRecord(db, members[1].id, "반응용", minutes(during, 30));
  await toggleReaction(db, members[0].id, recordId, "👍", during);
  await toggleReaction(db, members[2].id, recordId, "❤️", during);
  expect(await temperature(db, event)).toBe(
    Math.round((36.5 + (63.5 * 24) / 125) * 10) / 10,
  );
  await addSecretDeed(db, members[0].id, "몰래", during);
  expect(await temperature(db, event)).toBe(49.2);
});

test("온도는 100을 넘지 않는다", async () => {
  const { event, members } = await setup({ durationDays: 1, missionCount: 0 });
  for (let i = 0; i < 12; i++) await createRecord(db, members[i % 4].id, `기록${i}`, minutes(startsAt, 60 + i));
  expect(await temperature(db, event)).toBe(100);
});
