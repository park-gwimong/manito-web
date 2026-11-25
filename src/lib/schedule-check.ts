import { parseKstInput } from "./format";

/**
 * 일정 입력을 보내기 전에 화면에서 미리 살핀다. 고칠 곳을 한 번에 모두 알려 주기 위한 것이고,
 * 실제 검증은 서버(`validateSchedule`)가 다시 한다.
 */
export function scheduleProblems(
  input: { startsAt: string; endsAt: string; missionCount: string },
  maxMissions: number,
  now: Date,
): string[] {
  const problems: string[] = [];
  const startsAt = parseKstInput(input.startsAt);
  const endsAt = parseKstInput(input.endsAt);
  if (!startsAt) problems.push("시작 일시를 입력해 주세요.");
  else if (startsAt.getTime() <= now.getTime()) problems.push("시작 일시는 지금보다 뒤여야 해요.");
  if (!endsAt) problems.push("종료 일시를 입력해 주세요.");
  else if (startsAt && endsAt.getTime() <= startsAt.getTime()) problems.push("종료 일시는 시작 일시보다 뒤여야 해요.");
  const count = input.missionCount.trim() === "" ? Number.NaN : Number(input.missionCount);
  if (!Number.isInteger(count) || count < 0 || count > maxMissions) {
    problems.push(`미션 개수는 0개 이상 ${maxMissions}개 이하로 정해 주세요.`);
  }
  return problems;
}
