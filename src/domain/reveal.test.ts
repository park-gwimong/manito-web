import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, missionDeliveries, type Participant } from "@/db/schema";
import { DEFAULT_MISSIONS } from "./default-missions";
import { createEvent } from "./events";
import { joinEvent } from "./participants";
import { advanceEvent, getGiverIdOf } from "./lifecycle";
import { addSecretDeed, createRecord, setVerdict } from "./records";
import { completeMission } from "./missions";
import {
  countUnguessed,
  finishPresentation,
  getMyGuess,
  getRevealData,
  setGuess,
  startPresentation,
} from "./reveal";

const now = new Date("2026-11-24T00:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const startsAt = days(1);
const during = days(2);
const closedAt = days(30);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(phase: "active" | "closed" = "closed") {
  const { event, organizer } = await createEvent(
    db,
    { name: "테스트", startsAt, endsAt: days(11), missionCount: 5, organizerName: "개설자", organizerPin: "0000" },
    now,
  );
  const members: Participant[] = [organizer];
  for (let i = 1; i < 4; i++) {
    members.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, now));
  }
  await advanceEvent(db, event.id, startsAt);
  if (phase === "closed") await advanceEvent(db, event.id, closedAt);
  return { event, members, organizer };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ name: "DomainError", code });
}

const byId = (members: Participant[], id: string) => members.find((m) => m.id === id)!;

test("진행 중 추측은 GUESS_CLOSED, 마감 후에는 저장, 다시 고르면 덮어쓴다", async () => {
  const active = await setup("active");
  await expectCode(setGuess(db, active.members[0].id, active.members[1].id, during), "GUESS_CLOSED");

  const { members } = await setup();
  expect(await getMyGuess(db, members[0].id)).toBeNull();
  await setGuess(db, members[0].id, members[1].id, closedAt);
  expect(await getMyGuess(db, members[0].id)).toBe(members[1].id);
  await setGuess(db, members[0].id, members[2].id, closedAt);
  expect(await getMyGuess(db, members[0].id)).toBe(members[2].id);
});

test("자기 자신 추측은 INVALID_GUESS", async () => {
  const { members } = await setup();
  await expectCode(setGuess(db, members[0].id, members[0].id, closedAt), "INVALID_GUESS");
});

test("다른 이벤트 사람 추측은 INVALID_GUESS", async () => {
  const a = await setup();
  const b = await setup();
  await expectCode(setGuess(db, a.members[0].id, b.members[1].id, closedAt), "INVALID_GUESS");
});

test("발표 시작 후 추측은 GUESS_CLOSED", async () => {
  const { members } = await setup();
  await startPresentation(db, members[0].id, closedAt);
  await expectCode(setGuess(db, members[1].id, members[2].id, closedAt), "GUESS_CLOSED");
});

test("진행 중 startPresentation은 NOT_CLOSED, 개설자가 아니면 NOT_ORGANIZER", async () => {
  const active = await setup("active");
  await expectCode(startPresentation(db, active.members[0].id, during), "NOT_CLOSED");
  const { members } = await setup();
  await expectCode(startPresentation(db, members[1].id, closedAt), "NOT_ORGANIZER");
});

test("startPresentation은 두 번 불러도 시각이 바뀌지 않고 NOT_CLOSED로 거절된다", async () => {
  const { event, members } = await setup();
  await startPresentation(db, members[0].id, closedAt);
  await expectCode(startPresentation(db, members[0].id, days(31)), "NOT_CLOSED");
  const [row] = await db.select().from(events).where(eq(events.id, event.id));
  expect(row.presentationStartedAt).toEqual(closedAt);
});

test("finishPresentation은 발표 시작 전에는 거절되고 개설자만 가능하다", async () => {
  const { event, members } = await setup();
  await expectCode(finishPresentation(db, members[0].id, closedAt), "NOT_PRESENTING");
  await startPresentation(db, members[0].id, closedAt);
  await expectCode(finishPresentation(db, members[1].id, closedAt), "NOT_ORGANIZER");
  await finishPresentation(db, members[0].id, closedAt);
  const [row] = await db.select().from(events).where(eq(events.id, event.id));
  expect(row.status).toBe("revealed");
  await expectCode(finishPresentation(db, members[0].id, closedAt), "NOT_PRESENTING");
});

test("발표 시작 전에는 개설자도 getRevealData가 NOT_REVEALED", async () => {
  const { event, members } = await setup();
  await expectCode(getRevealData(db, event.id, members[0].id), "NOT_REVEALED");
});

test("발표 중: 개설자는 볼 수 있고 다른 참가자는 NOT_REVEALED", async () => {
  const { event, members } = await setup();
  await startPresentation(db, members[0].id, closedAt);
  await expect(getRevealData(db, event.id, members[0].id)).resolves.toBeTruthy();
  await expectCode(getRevealData(db, event.id, members[1].id), "NOT_REVEALED");
});

test("다른 이벤트의 참가자는 발표가 끝나도 NOT_REVEALED", async () => {
  const a = await setup();
  const b = await setup();
  await startPresentation(db, a.members[0].id, closedAt);
  await finishPresentation(db, a.members[0].id, closedAt);
  await expectCode(getRevealData(db, a.event.id, b.members[0].id), "NOT_REVEALED");
  await expectCode(getRevealData(db, a.event.id, b.members[1].id), "NOT_REVEALED");
});

test("발표 종료 후: 모든 참가자가 볼 수 있다", async () => {
  const { event, members } = await setup();
  await startPresentation(db, members[0].id, closedAt);
  await finishPresentation(db, members[0].id, closedAt);
  for (const m of members) await expect(getRevealData(db, event.id, m.id)).resolves.toBeTruthy();
});

test("chain은 전원을 한 번씩 포함하고, 각 항목의 giver가 다음 항목의 receiver다", async () => {
  const { event, members } = await setup();
  await startPresentation(db, members[0].id, closedAt);
  const { chain } = await getRevealData(db, event.id, members[0].id);
  expect(chain).toHaveLength(4);
  expect(chain[0].receiver.id).toBe(members[0].id);
  expect(new Set(chain.map((c) => c.receiver.id)).size).toBe(4);
  for (let i = 0; i < chain.length; i++) {
    expect(chain[i].giver.id).toBe(chain[(i + 1) % chain.length].receiver.id);
    expect(chain[i].giver.id).toBe(await getGiverIdOf(db, chain[i].receiver.id));
    expect(chain[i].giver.name).toBe(byId(members, chain[i].giver.id).name);
  }
});

test("chain 항목: 맞은 기록 true, 아닌 기록 false, 판정 없는 기록 null, 몰래 한 일은 giver의 것", async () => {
  const { event, members } = await setup("active");
  const author = members[0];
  const giverId = (await getGiverIdOf(db, author.id))!;
  const yes = await createRecord(db, author.id, "맞는 기록", new Date(during.getTime() + 1000));
  const no = await createRecord(db, author.id, "아닌 기록", new Date(during.getTime() + 2000));
  await createRecord(db, author.id, "판정 없는 기록", new Date(during.getTime() + 3000));
  await setVerdict(db, giverId, yes.id, true, during);
  await setVerdict(db, giverId, no.id, false, during);
  await addSecretDeed(db, giverId, "몰래 청소", during);
  await advanceEvent(db, event.id, closedAt);
  await startPresentation(db, author.id, closedAt);

  const { chain } = await getRevealData(db, event.id, author.id);
  const entry = chain.find((c) => c.receiver.id === author.id)!;
  expect(entry.giver.id).toBe(giverId);
  expect(entry.records.map((r) => [r.body, r.result])).toEqual([
    ["맞는 기록", true],
    ["아닌 기록", false],
    ["판정 없는 기록", null],
  ]);
  expect(entry.unnoticedDeeds.map((d) => d.body)).toEqual(["몰래 청소"]);
  for (const other of chain.filter((c) => c !== entry)) {
    expect(other.records).toEqual([]);
    expect(other.unnoticedDeeds.map((d) => d.body)).not.toContain("몰래 청소");
  }
});

test("추측하지 않은 사람은 guess가 null, 추측한 사람은 이름과 정답 여부", async () => {
  const { event, members } = await setup();
  const giverId = (await getGiverIdOf(db, members[0].id))!;
  const wrong = members.find((m) => m.id !== members[0].id && m.id !== giverId)!;
  await setGuess(db, members[0].id, wrong.id, closedAt);
  await setGuess(db, members[1].id, (await getGiverIdOf(db, members[1].id))!, closedAt);
  await startPresentation(db, members[0].id, closedAt);

  const { chain } = await getRevealData(db, event.id, members[0].id);
  const of = (id: string) => chain.find((c) => c.receiver.id === id)!;
  expect(of(members[0].id).guess).toEqual({ name: wrong.name, correct: false });
  const g1 = of(members[1].id).guess!;
  expect(g1.correct).toBe(true);
  expect(of(members[2].id).guess).toBeNull();
  expect(of(members[3].id).guess).toBeNull();
});

test("scores는 total 내림차순이고 summary가 채워진다", async () => {
  const { event, members } = await setup("active");
  await createRecord(db, members[0].id, "기록1", during);
  await createRecord(db, members[0].id, "기록2", during);
  await createRecord(db, members[1].id, "기록3", during);
  await advanceEvent(db, event.id, closedAt);
  await startPresentation(db, members[0].id, closedAt);
  const { scores, summary } = await getRevealData(db, event.id, members[0].id);
  expect(scores).toHaveLength(4);
  for (let i = 1; i < scores.length; i++) expect(scores[i - 1].score.total).toBeGreaterThanOrEqual(scores[i].score.total);
  expect(scores[0].id).toBe(members[0].id);
  expect(summary.recordCount).toBe(3);
  expect(summary.missionsCompleted).toBe(0);
  expect(summary.temperature).toBeGreaterThan(36.5);
});

test("awards: 동점이면 둘 다, 아무도 해당 없으면 빈 배열", async () => {
  const { event, members } = await setup("active");
  // members[0], members[1]의 기록이 각각 '맞아요'로 판정된다(상은 기록 작성자 기준).
  const giver0 = (await getGiverIdOf(db, members[0].id))!;
  const giver1 = (await getGiverIdOf(db, members[1].id))!;
  const r0 = await createRecord(db, members[0].id, "a", during);
  const r1 = await createRecord(db, members[1].id, "b", during);
  await setVerdict(db, giver0, r0.id, true, during);
  await setVerdict(db, giver1, r1.id, true, during);
  await addSecretDeed(db, members[2].id, "몰래", during);
  await advanceEvent(db, event.id, during);
  const [delivery] = await db
    .select()
    .from(missionDeliveries)
    .where(eq(missionDeliveries.participantId, members[3].id));
  await completeMission(db, members[3].id, delivery.id, during);
  await advanceEvent(db, event.id, closedAt);
  await startPresentation(db, members[0].id, closedAt);

  const { awards, missions } = await getRevealData(db, event.id, members[0].id);
  // 미션 목록 전체가 공개되고, 해낸 사람만 이름이 붙는다.
  expect(missions).toHaveLength(DEFAULT_MISSIONS.length);
  expect(missions[0]).toEqual({ body: delivery.body, completedBy: [members[3].name] });
  expect(missions.slice(1).every((m) => m.completedBy.length === 0)).toBe(true);
  expect([...awards.nunchi].sort()).toEqual([members[0].name, members[1].name].sort());
  expect(awards.heotdari).toEqual([]);
  expect(awards.shadow).toEqual([members[2].name]);
  expect(awards.mission).toEqual([members[3].name]);
});

test("countUnguessed는 이 이벤트에서 아직 추측하지 않은 사람 수만 센다", async () => {
  const other = await setup();
  await setGuess(db, other.members[0].id, other.members[1].id, closedAt);

  const { event, members } = await setup();
  expect(await countUnguessed(db, event.id)).toBe(4);
  await setGuess(db, members[0].id, members[1].id, closedAt);
  await setGuess(db, members[0].id, members[2].id, closedAt);
  expect(await countUnguessed(db, event.id)).toBe(3);
  for (const m of members.slice(1)) await setGuess(db, m.id, members[0].id, closedAt);
  expect(await countUnguessed(db, event.id)).toBe(0);
});
