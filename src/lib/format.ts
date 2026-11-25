// 화면 표시용 포맷. 서버 시간대와 무관하게 항상 KST(UTC+9) 기준으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function kstParts(d: Date) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `12월 3일 14:20` */
export function formatKst(d: Date): string {
  const p = kstParts(d);
  return `${p.month}월 ${p.day}일 ${pad(p.hour)}:${pad(p.minute)}`;
}

/** `14:20` */
export function formatKstTime(d: Date): string {
  const p = kstParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 같은 KST 날짜끼리 묶기 위한 키. `2026-12-03` */
export function kstDayKey(d: Date): string {
  const p = kstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 피드 날짜 구분선. `오늘`, `어제`, 그 밖에는 `12월 3일 수요일` */
export function formatKstDay(d: Date, now: Date): string {
  const key = kstDayKey(d);
  if (key === kstDayKey(now)) return "오늘";
  if (key === kstDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "어제";
  const p = kstParts(d);
  const weekday = WEEKDAYS[new Date(d.getTime() + KST_OFFSET_MS).getUTCDay()];
  return `${p.month}월 ${p.day}일 ${weekday}요일`;
}

/** `52.5℃` */
export function formatTemp(t: number): string {
  return `${t.toFixed(1)}℃`;
}

/** `D-9`, 0이면 `D-DAY` */
export function ddayLabel(n: number): string {
  return n === 0 ? "D-DAY" : `D-${n}`;
}

/** `<input type="datetime-local">` 값(KST 벽시계 시각)을 Date로. 형식이 틀리거나 없는 날짜면 null. */
export function parseKstInput(value: string): Date | null {
  if (!KST_INPUT.test(value)) return null;
  const d = new Date(`${value}:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  // 2월 30일처럼 넘쳐서 다른 날로 바뀐 값은 거부한다.
  return toKstInput(d) === value ? d : null;
}

/** Date를 `<input type="datetime-local">` 값(KST)으로. */
export function toKstInput(d: Date): string {
  const p = kstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
