export const MIN_PARTICIPANTS = 4;
/** 진행 중에 참가자를 내보낸 뒤에도 남아 있어야 하는 인원. 둘이면 서로가 서로의 마니또라 비밀이 없다. */
export const MIN_ACTIVE_PARTICIPANTS = 3;
export const RECORD_POINTS = 10;
export const RECORD_DAILY_CAP = 3;
export const MISSION_POINTS = 10;
export const HIT_BONUS = 20;
export const RECOGNIZED_BONUS = 20;
export const VERDICT_BONUS = 5;
export const SECRET_DEED_BONUS = 5;
export const GUESS_BONUS = 50;
export const BASE_TEMP = 36.5;
export const MAX_TEMP = 100;
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🥹"] as const;
export const BODY_MAX = 500;
export const NAME_MAX = 20;
export const PIN_MAX_FAILS = 5;
/** 첫 잠금(PIN_MAX_FAILS번째 실패) 시간. 그 뒤로 실패할 때마다 두 배가 된다. */
export const PIN_LOCK_MINUTES = 5;
/** 잠금 시간 상한(24시간). */
export const PIN_LOCK_MAX_MINUTES = 1440;
