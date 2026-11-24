import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, missionDeliveries, type Participant } from "@/db/schema";
import { createEvent } from "./events";
import { joinEvent } from "./participants";
import { advanceEvent, getGiverIdOf, getTargetOf } from "./lifecycle";
import { addSecretDeed, createRecord, setVerdict, toggleReaction } from "./records";
import { completeMission } from "./missions";
import { getDuty, getFeed, getHeader, getLobby, getRanking } from "./views";

const now = new Date("2026-11-24T00:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const startsAt = days(1);
const during = days(2);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(start = true) {
  const { event, organizer } = await createEvent(
    db,
    { name: "테스트", startsAt, endsAt: days(11), missionCount: 5, organizerName: "개설자", organizerPin: "0000" },
    now,
  );
  const members: Participant[] = [organizer];
  for (let i = 1; i < 4; i++) {
    members.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, now));
  }
  if (start) await advanceEvent(db, event.id, startsAt);
  return { event, members };
}

/** B(작성자), A(B의 마니또), C(제3자), 그리고 B가 마니또인 사람 D. */
async function cast(members: Participant[]) {
  const b = members[0];
  const aId = (await getGiverIdOf(db, b.id))!;
  const a = members.find((m) => m.id === aId)!;
  const c = members.find((m) => m.id !== a.id && m.id !== b.id)!;
  return { a, b, c };
}

test("마니또 A의 피드: r에 judge.myVerdict === true", async () => {
  const { event, members } = await setup();
  const { a, b } = await cast(members);
  const r = await createRecord(db, b.id, "기록", during);
  await setVerdict(db, a.id, r.id, true, during);
  const [item] = await getFeed(db, event.id, a.id);
  expect(item.judge).toEqual({ myVerdict: true });
  expect(item.verdictStatus).toBe("done");
  expect(item.isMine).toBe(false);
});

test("판정 전 마니또의 피드는 judge.myVerdict null, verdictStatus pending", async () => {
  const { event, members } = await setup();
  const { a, b } = await cast(members);
  await createRecord(db, b.id, "기록", during);
  const [item] = await getFeed(db, event.id, a.id);
  expect(item.judge).toEqual({ myVerdict: null });
  expect(item.verdictStatus).toBe("pending");
});

test("작성자 B의 피드: r에 judge 키가 없고 result 키도 없다", async () => {
  const { event, members } = await setup();
  const { a, b } = await cast(members);
  const r = await createRecord(db, b.id, "기록", during);
  await setVerdict(db, a.id, r.id, false, during);
  const [item] = await getFeed(db, event.id, b.id);
  expect('judge' in item).toBe(false);
  expect('result' in item).toBe(false);
  expect(item.verdictStatus).toBe("done");
  expect(item.isMine).toBe(true);
});

test("제3자 C의 피드: judge·result 키가 없다", async () => {
  const { event, members } = await setup();
  const { a, b, c } = await cast(members);
  const r = await createRecord(db, b.id, "기록", during);
  await setVerdict(db, a.id, r.id, true, during);
  const [item] = await getFeed(db, event.id, c.id);
  expect('judge' in item).toBe(false);
  expect('result' in item).toBe(false);
  expect(item.isMine).toBe(false);
});

test("B, C의 피드를 JSON.stringify한 문자열에 비밀 필드명이 없다", async () => {
  const { event, members } = await setup();
  const { a, b, c } = await cast(members);
  const r = await createRecord(db, b.id, "기록", during);
  await setVerdict(db, a.id, r.id, true, during);
  await toggleReaction(db, c.id, r.id, "👍", during);
  for (const viewer of [b, c]) {
    const json = JSON.stringify(await getFeed(db, event.id, viewer.id));
    for (const word of ["judge", "result", "giverId", "myVerdict"]) {
      expect(json).not.toContain(word);
    }
  }
});

test("피드는 최신순이고 반응 수와 내 반응 여부를 담는다", async () => {
  const { event, members } = await setup();
  const { b, c } = await cast(members);
  await createRecord(db, b.id, "먼저", during);
  const second = await createRecord(db, b.id, "나중", days(3));
  await toggleReaction(db, c.id, second.id, "👍", days(3));
  await toggleReaction(db, b.id, second.id, "👍", days(3));
  await toggleReaction(db, b.id, second.id, "❤️", days(3));
  const feed = await getFeed(db, event.id, c.id);
  expect(feed.map((f) => f.body)).toEqual(["나중", "먼저"]);
  expect(feed[0].reactions).toEqual(
    expect.arrayContaining([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "❤️", count: 1, mine: false },
    ]),
  );
  expect(feed[0].reactions).toHaveLength(2);
  expect(feed[1].reactions).toEqual([]);
  expect(feed[0].author).toEqual({ id: b.id, name: b.name });
});

test("revealed가 되면 모두에게 result가 보인다 (판정 없는 글은 null)", async () => {
  const { event, members } = await setup();
  const { a, b, c } = await cast(members);
  const judged = await createRecord(db, b.id, "판정됨", during);
  await createRecord(db, b.id, "미판정", days(3));
  await setVerdict(db, a.id, judged.id, true, during);
  await db.update(events).set({ status: "revealed" }).where(eq(events.id, event.id));
  for (const viewer of [a, b, c]) {
    const feed = await getFeed(db, event.id, viewer.id);
    expect(feed.find((f) => f.body === "판정됨")!.result).toBe(true);
    expect(feed.find((f) => f.body === "미판정")!.result).toBeNull();
  }
  // 마니또가 아닌 사람에게는 여전히 judge가 없다.
  expect('judge' in (await getFeed(db, event.id, c.id))[0]).toBe(false);
});

test("A의 내 임무: 대상은 B, B의 글만, A의 미션만, A의 몰래 한 일만", async () => {
  const { event, members } = await setup();
  const { a, b, c } = await cast(members);
  expect((await getTargetOf(db, a.id))!.id).toBe(b.id);
  await createRecord(db, b.id, "B의 글", during);
  await createRecord(db, c.id, "C의 글", during);
  await createRecord(db, a.id, "A의 글", during);
  await addSecretDeed(db, a.id, "A의 몰래", during);
  await addSecretDeed(db, c.id, "C의 몰래", during);
  const missionDays = days(6);
  await advanceEvent(db, event.id, missionDays);
  const mine = await db.select().from(missionDeliveries).where(eq(missionDeliveries.participantId, a.id));
  expect(mine.length).toBeGreaterThan(0);
  await completeMission(db, a.id, mine[0].id, missionDays);

  const duty = (await getDuty(db, event.id, a.id))!;
  expect(duty.target).toEqual({ id: b.id, name: b.name });
  expect(duty.targetRecords.map((r) => r.body)).toEqual(["B의 글"]);
  expect(duty.targetRecords[0].judge).toEqual({ myVerdict: null });
  expect(duty.secretDeeds.map((d) => d.body)).toEqual(["A의 몰래"]);
  expect(duty.missions).toHaveLength(mine.length);
  expect(duty.missions.find((m) => m.id === mine[0].id)!.completed).toBe(true);
  expect(duty.missions.filter((m) => m.completed)).toHaveLength(1);
  const allIds = new Set(
    (await db.select().from(missionDeliveries).where(eq(missionDeliveries.participantId, a.id))).map((m) => m.id),
  );
  expect(duty.missions.every((m) => allIds.has(m.id))).toBe(true);
});

test("B의 내 임무에는 A가 쓴 몰래 한 일이 없다", async () => {
  const { event, members } = await setup();
  const { a, b } = await cast(members);
  await addSecretDeed(db, a.id, "A의 몰래", during);
  const duty = (await getDuty(db, event.id, b.id))!;
  expect(duty.secretDeeds).toEqual([]);
  expect(JSON.stringify(duty)).not.toContain("A의 몰래");
});

test("배정 전 getDuty는 null", async () => {
  const { event, members } = await setup(false);
  expect(await getDuty(db, event.id, members[0].id)).toBeNull();
});

test("순위: 전원 포함, 점수 내림차순, 0점인 사람도 나오고 동점은 이름순", async () => {
  const { event, members } = await setup();
  const [, p1, p2] = members;
  await createRecord(db, p2.id, "a", during);
  await createRecord(db, p2.id, "b", during);
  await createRecord(db, p1.id, "c", during);
  const r = await getRanking(db, event.id, p1.id);
  expect(r.entries).toHaveLength(4);
  expect(r.entries.map((e) => e.points)).toEqual([20, 10, 0, 0]);
  expect(r.entries[0]).toMatchObject({ id: p2.id, isMe: false });
  expect(r.entries[1]).toMatchObject({ id: p1.id, isMe: true });
  const zeros = r.entries.slice(2).map((e) => e.name);
  expect(zeros).toEqual([...zeros].sort((x, y) => x.localeCompare(y)));
  expect(r.stats.recordCount).toBe(3);
  expect(JSON.stringify(r)).not.toContain("rank");
});

test("순위 통계: 배달·완료 미션 수", async () => {
  const { event, members } = await setup();
  const t = days(6);
  await advanceEvent(db, event.id, t);
  const rows = await db.select().from(missionDeliveries).where(eq(missionDeliveries.eventId, event.id));
  await completeMission(db, rows[0].participantId, rows[0].id, t);
  const r = await getRanking(db, event.id, members[0].id);
  expect(r.stats.missionsDelivered).toBe(rows.length);
  expect(r.stats.missionsCompleted).toBe(1);
});

test("로비: 참가자 목록과 시작을 놓치면 startMissed true", async () => {
  const { event, members } = await setup(false);
  const lobby = await getLobby(db, event.id);
  expect(lobby.participants).toHaveLength(4);
  expect(lobby.participants.find((p) => p.id === members[0].id)!.isOrganizer).toBe(true);
  expect(lobby.startMissed).toBe(false);
  expect(lobby.minParticipants).toBe(4);

  const small = await createEvent(
    db,
    { name: "작은", startsAt, endsAt: days(11), missionCount: 5, organizerName: "혼자", organizerPin: "0000" },
    now,
  );
  await advanceEvent(db, small.event.id, startsAt);
  expect((await getLobby(db, small.event.id)).startMissed).toBe(true);
});

test("헤더: active일 때만 KST 기준 dday, 음수 없음", async () => {
  const { event } = await setup();
  const live = await advanceEvent(db, event.id, during);
  const h = await getHeader(db, live, during);
  expect(h.temperature).toBeGreaterThanOrEqual(36.5);
  expect(h.dday).toBe(9);
  const lastDay = new Date("2026-12-04T14:59:00Z"); // KST 12-04 23:59, endsAt은 12-05 00:00Z = KST 12-05 09:00
  expect((await getHeader(db, live, lastDay)).dday).toBe(1);
  expect((await getHeader(db, { ...live, endsAt: lastDay }, new Date(lastDay.getTime() + 1000))).dday).toBe(0);
  const late = await getHeader(db, { ...live, endsAt: days(0) }, days(5));
  expect(late.dday).toBe(0);
  expect((await getHeader(db, { ...live, status: "closed" }, during)).dday).toBeNull();
});
