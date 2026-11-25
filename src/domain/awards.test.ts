import { expect, test } from "vitest";
import { decideAwards, type AwardStats } from "./awards";

const person = (id: string, over: Partial<AwardStats> = {}): AwardStats => ({
  id,
  hits: 0,
  lastHitAt: null,
  misses: 0,
  lastMissAt: null,
  guessedRight: false,
  missionsDelivered: 0,
  missionsDone: 0,
  lastMissionAt: null,
  ...over,
});

test("해당자가 없는 부문은 수상자가 없다", () => {
  expect(decideAwards([person("a"), person("b")])).toEqual({ nunchi: null, heotdari: null, mission: null });
});

test("수가 가장 많은 한 명이 받는다", () => {
  const result = decideAwards([
    person("a", { hits: 1, lastHitAt: 1 }),
    person("b", { hits: 3, lastHitAt: 9 }),
    person("c", { misses: 2, lastMissAt: 5 }),
  ]);
  expect(result).toEqual({ nunchi: "b", heotdari: "c", mission: null });
});

test("눈치왕 동점: 적중률이 높은 사람, 그다음 내 마니또를 맞힌 사람", () => {
  // a와 b는 맞음 2개로 같다. a는 헛다리도 2개라 적중률이 낮다.
  expect(
    decideAwards([person("a", { hits: 2, misses: 2, lastHitAt: 1, lastMissAt: 1 }), person("b", { hits: 2, lastHitAt: 9 })])
      .nunchi,
  ).toBe("b");
  // 적중률도 같으면 마니또를 맞힌 사람.
  expect(
    decideAwards([person("a", { hits: 2, lastHitAt: 1 }), person("b", { hits: 2, lastHitAt: 9, guessedRight: true })]).nunchi,
  ).toBe("b");
});

test("헛다리왕 동점: 헛다리 비율이 높은 사람, 그다음 내 마니또를 못 맞힌 사람", () => {
  expect(
    decideAwards([person("a", { misses: 2, hits: 2, lastMissAt: 1 }), person("b", { misses: 2, lastMissAt: 9 })]).heotdari,
  ).toBe("b");
  expect(
    decideAwards([person("a", { misses: 2, lastMissAt: 1, guessedRight: true }), person("b", { misses: 2, lastMissAt: 9 })])
      .heotdari,
  ).toBe("b");
});

test("미션왕 동점: 받은 미션 중 완료한 비율이 높은 사람", () => {
  const result = decideAwards([
    person("a", { missionsDone: 3, missionsDelivered: 5, lastMissionAt: 1 }),
    person("b", { missionsDone: 3, missionsDelivered: 3, lastMissionAt: 9 }),
  ]);
  expect(result.mission).toBe("b");
});

test("그래도 같으면 아직 상을 받지 않은 사람이 받는다", () => {
  // a와 b는 미션이 완전히 같다. a는 이미 눈치왕이라 미션왕은 b에게 간다.
  const result = decideAwards([
    person("a", { hits: 1, lastHitAt: 1, missionsDone: 3, missionsDelivered: 3, lastMissionAt: 1 }),
    person("b", { missionsDone: 3, missionsDelivered: 3, lastMissionAt: 9 }),
  ]);
  expect(result).toEqual({ nunchi: "a", heotdari: null, mission: "b" });
});

test("혼자 가장 많으면 이미 상을 받았어도 또 받는다", () => {
  const result = decideAwards([
    person("a", { hits: 1, lastHitAt: 1, missionsDone: 4, missionsDelivered: 4, lastMissionAt: 1 }),
    person("b", { missionsDone: 3, missionsDelivered: 3, lastMissionAt: 9 }),
  ]);
  expect(result).toEqual({ nunchi: "a", heotdari: null, mission: "a" });
});

test("끝까지 같으면 그 수에 먼저 도달한 사람, 그것도 같으면 먼저 참가한 사람", () => {
  const same = { missionsDone: 3, missionsDelivered: 3 };
  expect(decideAwards([person("a", { ...same, lastMissionAt: 9 }), person("b", { ...same, lastMissionAt: 2 })]).mission).toBe("b");
  expect(decideAwards([person("a", { ...same, lastMissionAt: 5 }), person("b", { ...same, lastMissionAt: 5 })]).mission).toBe("a");
});
