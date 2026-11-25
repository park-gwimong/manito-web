import { expect, test } from "vitest";
import { scheduleProblems } from "./schedule-check";

const now = new Date("2026-11-25T00:00:00Z"); // KST 09:00

test("문제가 없으면 빈 목록", () => {
  expect(scheduleProblems({ startsAt: "2026-11-26T09:00", endsAt: "2026-12-03T09:00", missionCount: "5" }, 30, now)).toEqual([]);
});

test("고칠 곳을 한 번에 모두 알려 준다", () => {
  const problems = scheduleProblems({ startsAt: "2026-11-20T10:00", endsAt: "2026-11-19T10:00", missionCount: "99" }, 30, now);
  expect(problems).toHaveLength(3);
  expect(problems[0]).toContain("지금보다 뒤");
  expect(problems[1]).toContain("시작 일시보다 뒤");
  expect(problems[2]).toContain("30개 이하");
});

test("입력은 한국 시간으로 읽는다", () => {
  // KST 09:00이 지금이므로 09:00은 과거(같음), 09:01은 미래.
  expect(scheduleProblems({ startsAt: "2026-11-25T09:00", endsAt: "2026-11-26T09:00", missionCount: "0" }, 30, now)).toHaveLength(1);
  expect(scheduleProblems({ startsAt: "2026-11-25T09:01", endsAt: "2026-11-26T09:00", missionCount: "0" }, 30, now)).toEqual([]);
});

test("빈 칸과 소수 미션 개수", () => {
  expect(scheduleProblems({ startsAt: "", endsAt: "", missionCount: "1.5" }, 30, now)).toHaveLength(3);
});
