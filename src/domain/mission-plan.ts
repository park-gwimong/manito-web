/**
 * 미션이 언제 도착하는지 정하는 규칙. DB를 쓰지 않는 순수 계산이라 화면(미리 보기)에서도 그대로 쓴다.
 *
 * - daily: 첫 미션은 시작 시각에, 그 뒤로는 매일 정해진 시각(한국 시간)에 하나씩.
 * - alternate: 첫 미션은 시작 시각에, 그 뒤로는 이틀에 하나씩.
 * - custom: 정한 개수를 기간에 고르게 나눈다.
 */
export const MISSION_MODES = ["daily", "alternate", "custom"] as const;
export type MissionMode = (typeof MISSION_MODES)[number];

export const DEFAULT_MISSION_MODE: MissionMode = "daily";
export const DEFAULT_MISSION_HOUR = 9;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const KST_OFFSET = 9 * HOUR; // 한국은 서머타임이 없어 항상 UTC+9다.
/** 종료까지 이만큼도 남지 않은 날에는 미션을 보내지 않는다. 할 시간이 없기 때문이다. */
export const LAST_MISSION_GAP_MS = 6 * HOUR;

export type MissionPlan = {
  startsAt: Date;
  endsAt: Date;
  missionMode: MissionMode;
  /** 0~23. 매일·이틀 방식에서 미션이 도착하는 시각(한국 시간). */
  missionHour: number;
  /** custom 방식에서 쓰는 개수. 다른 방식에서는 일정에서 계산한 값을 저장해 둔다. */
  missionCount: number;
};

export function isMissionMode(value: unknown): value is MissionMode {
  return (MISSION_MODES as readonly unknown[]).includes(value);
}

export function isMissionHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}

/** 미션이 도착하는 시각을 순서대로. 0번은 항상 시작 시각이다(custom에서 0개면 빈 배열). */
export function slotTimes(plan: MissionPlan): Date[] {
  const start = plan.startsAt.getTime();
  const end = plan.endsAt.getTime();

  if (plan.missionMode === "custom") {
    const span = end - start;
    return Array.from(
      { length: Math.max(0, plan.missionCount) },
      (_, i) => new Date(start + Math.floor((i * span) / plan.missionCount)),
    );
  }

  const step = plan.missionMode === "daily" ? 1 : 2;
  const startDay = Math.floor((start + KST_OFFSET) / DAY); // 시작한 날(한국 날짜)
  const times = [new Date(start)];
  for (let day = startDay + step; ; day += step) {
    const t = day * DAY + plan.missionHour * HOUR - KST_OFFSET;
    if (t > end - LAST_MISSION_GAP_MS) break;
    times.push(new Date(t));
  }
  return times;
}

/** 이 일정으로 한 사람이 받게 되는 미션 수. */
export function plannedMissionCount(plan: MissionPlan): number {
  return plan.missionMode === "custom" ? plan.missionCount : slotTimes(plan).length;
}
