import { expect, test } from "vitest";
import { plannedMissionCount, slotTimes, type MissionPlan } from "./mission-plan";

const kst = (s: string) => new Date(`${s}:00+09:00`);
const plan = (over: Partial<MissionPlan>): MissionPlan => ({
  startsAt: kst("2026-12-01T09:00"),
  endsAt: kst("2026-12-08T09:00"),
  missionMode: "daily",
  missionHour: 9,
  missionCount: 0,
  ...over,
});
const fmt = (ds: Date[]) => ds.map((d) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(5, 16));

test("매일: 첫 미션은 시작 시각, 그 뒤로 매일 정한 시각", () => {
  // 12/1 09:00 ~ 12/8 09:00. 마지막 날 9시는 종료와 같아서 보내지 않는다.
  expect(fmt(slotTimes(plan({})))).toEqual([
    "12-01T09:00",
    "12-02T09:00",
    "12-03T09:00",
    "12-04T09:00",
    "12-05T09:00",
    "12-06T09:00",
    "12-07T09:00",
  ]);
  expect(plannedMissionCount(plan({}))).toBe(7);
});

test("매일: 시작 시각이 도착 시각과 달라도 하루에 하나", () => {
  const times = slotTimes(plan({ startsAt: kst("2026-12-01T14:30"), endsAt: kst("2026-12-04T18:00"), missionHour: 8 }));
  expect(fmt(times)).toEqual(["12-01T14:30", "12-02T08:00", "12-03T08:00", "12-04T08:00"]);
});

test("매일: 종료까지 6시간이 안 남은 날에는 보내지 않는다", () => {
  const base = { startsAt: kst("2026-12-01T09:00"), missionHour: 9 };
  expect(slotTimes(plan({ ...base, endsAt: kst("2026-12-03T14:59") }))).toHaveLength(2);
  expect(slotTimes(plan({ ...base, endsAt: kst("2026-12-03T15:00") }))).toHaveLength(3);
});

test("이틀에 하나", () => {
  expect(fmt(slotTimes(plan({ missionMode: "alternate" })))).toEqual([
    "12-01T09:00",
    "12-03T09:00",
    "12-05T09:00",
    "12-07T09:00",
  ]);
});

test("직접 정하기: 개수를 기간에 고르게 나눈다", () => {
  const p = plan({ missionMode: "custom", missionCount: 2, endsAt: kst("2026-12-03T09:00") });
  expect(fmt(slotTimes(p))).toEqual(["12-01T09:00", "12-02T09:00"]);
  expect(plannedMissionCount(p)).toBe(2);
  expect(slotTimes(plan({ missionMode: "custom", missionCount: 0 }))).toEqual([]);
});

test("아주 짧은 이벤트도 시작할 때 하나는 받는다", () => {
  expect(slotTimes(plan({ endsAt: kst("2026-12-01T12:00") }))).toHaveLength(1);
});
