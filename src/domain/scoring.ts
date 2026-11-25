import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  assignments,
  guesses,
  missionDeliveries,
  participants,
  reactions,
  records,
  secretDeeds,
  verdicts,
  type Event,
} from "@/db/schema";
import {
  BASE_TEMP,
  GUESS_BONUS,
  HIT_BONUS,
  MAX_TEMP,
  MISSION_POINTS,
  RECOGNIZED_BONUS,
  RECORD_DAILY_CAP,
  RECORD_POINTS,
  SECRET_DEED_BONUS,
  VERDICT_BONUS,
} from "./constants";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 `YYYY-MM-DD`. */
export function kstDayKey(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export type ScoreKey = "record" | "mission" | "hit" | "recognized" | "verdict" | "secretDeed" | "guess";

/** 점수가 어디서 나왔는지 한 줄. `skipped`는 하루 한도를 넘어 점수가 붙지 않은 기록 수다. */
export type ScoreLine = { key: ScoreKey; count: number; points: number; skipped?: number };

/** 화면에 보여 줄 항목 이름과 한 건의 점수. 순서가 곧 보여 주는 순서다. */
export const SCORE_RULES: { key: ScoreKey; label: string; each: number; final: boolean }[] = [
  { key: "record", label: "기록", each: RECORD_POINTS, final: false },
  { key: "mission", label: "미션 완료", each: MISSION_POINTS, final: false },
  { key: "hit", label: "알아챈 기록", each: HIT_BONUS, final: true },
  { key: "recognized", label: "알아봐 준 기록", each: RECOGNIZED_BONUS, final: true },
  { key: "verdict", label: "마니또 확인 참여", each: VERDICT_BONUS, final: true },
  { key: "secretDeed", label: "몰래 한 일 메모를 남긴 날", each: SECRET_DEED_BONUS, final: true },
  { key: "guess", label: "내 마니또 맞히기", each: GUESS_BONUS, final: true },
];

/** 실시간 공개용 포인트(기록 + 미션)의 합. 내역은 `liveLines`. */
export async function livePoints(db: Db, eventId: string): Promise<Map<string, number>> {
  const lines = await liveLines(db, eventId);
  return new Map([...lines].map(([id, ls]) => [id, ls.reduce((sum, l) => sum + l.points, 0)]));
}

/**
 * 실시간 공개용 포인트의 내역(기록, 미션). 판정·배정 테이블은 읽지 않으므로 마니또 정보가 새지 않는다.
 * 기록은 KST 하루당 작성 시각이 빠른 RECORD_DAILY_CAP건까지만 점수를 받는다.
 * 해당이 없는 항목은 싣지 않는다.
 */
export async function liveLines(db: Db, eventId: string): Promise<Map<string, ScoreLine[]>> {
  const points = new Map<string, number>();
  const skipped = new Map<string, number>();
  const missionCounts = new Map<string, number>();
  const members = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.eventId, eventId));
  for (const m of members) points.set(m.id, 0);

  const recordRows = await db
    .select({ id: records.id, authorId: records.authorId, createdAt: records.createdAt })
    .from(records)
    .where(eq(records.eventId, eventId));
  recordRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const perDay = new Map<string, number>();
  for (const r of recordRows) {
    const key = `${r.authorId}|${kstDayKey(r.createdAt)}`;
    const used = perDay.get(key) ?? 0;
    if (used >= RECORD_DAILY_CAP) {
      skipped.set(r.authorId, (skipped.get(r.authorId) ?? 0) + 1);
      continue;
    }
    perDay.set(key, used + 1);
    points.set(r.authorId, (points.get(r.authorId) ?? 0) + RECORD_POINTS);
  }

  const done = await db
    .select({ participantId: missionDeliveries.participantId })
    .from(missionDeliveries)
    .where(and(eq(missionDeliveries.eventId, eventId), isNotNull(missionDeliveries.completedAt)));
  for (const d of done) missionCounts.set(d.participantId, (missionCounts.get(d.participantId) ?? 0) + 1);

  const result = new Map<string, ScoreLine[]>();
  for (const [id, recordPoints] of points) {
    const lines: ScoreLine[] = [];
    const over = skipped.get(id) ?? 0;
    if (recordPoints > 0 || over > 0) {
      lines.push({ key: "record", count: recordPoints / RECORD_POINTS, points: recordPoints, ...(over > 0 && { skipped: over }) });
    }
    const missions = missionCounts.get(id) ?? 0;
    if (missions > 0) lines.push({ key: "mission", count: missions, points: missions * MISSION_POINTS });
    result.set(id, lines);
  }
  return result;
}

export type FinalScore = {
  live: number;
  hit: number;
  recognized: number;
  verdict: number;
  secretDeed: number;
  guess: number;
  total: number;
  /** 점수가 붙은 항목만, `SCORE_RULES` 순서로. 합이 total이다. */
  lines: ScoreLine[];
};

/** 종료 후 공개용 최종 점수. 판정·배정·추측 정보를 사용하므로 공개 단계에서만 호출한다. */
export async function finalScores(db: Db, eventId: string): Promise<Map<string, FinalScore>> {
  const liveByMember = await liveLines(db, eventId);
  const ids = [...liveByMember.keys()];
  const result = new Map<string, FinalScore>();
  if (ids.length === 0) return result;

  const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const hits = new Map<string, number>();
  const recognized = new Map<string, number>();
  const verdictCounts = new Map<string, number>();
  const deeds = new Map<string, number>();

  const [giverOf, verdictRows, deedRows, guessRows] = await Promise.all([
    db.select().from(assignments).where(eq(assignments.eventId, eventId)),
    db
      .select({ authorId: records.authorId, isMine: verdicts.isMine })
      .from(verdicts)
      .innerJoin(records, eq(records.id, verdicts.recordId))
      .where(eq(records.eventId, eventId)),
    db
      .select({ giverId: secretDeeds.giverId, createdAt: secretDeeds.createdAt })
      .from(secretDeeds)
      .where(eq(secretDeeds.eventId, eventId)),
    db.select().from(guesses).where(inArray(guesses.participantId, ids)),
  ]);
  const giverByReceiver = new Map(giverOf.map((a) => [a.receiverId, a.giverId]));

  for (const v of verdictRows) {
    const judge = giverByReceiver.get(v.authorId);
    if (judge) count(verdictCounts, judge);
    if (v.isMine) {
      count(hits, v.authorId);
      if (judge) count(recognized, judge);
    }
  }
  // 많이 적는다고 점수가 늘지 않도록, 메모를 남긴 날(KST)마다 한 번만 센다.
  const deedDays = new Set(deedRows.map((d) => `${d.giverId}|${kstDayKey(d.createdAt)}`));
  for (const key of deedDays) count(deeds, key.split("|")[0]);

  for (const id of ids) {
    const guess = guessRows.find((g) => g.participantId === id);
    const guessed = guess !== undefined && guess.guessedId === giverByReceiver.get(id);
    const lines: ScoreLine[] = [...(liveByMember.get(id) ?? [])];
    const add = (key: ScoreKey, n: number, each: number) => {
      if (n > 0) lines.push({ key, count: n, points: n * each });
    };
    add("hit", hits.get(id) ?? 0, HIT_BONUS);
    add("recognized", recognized.get(id) ?? 0, RECOGNIZED_BONUS);
    add("verdict", verdictCounts.get(id) ?? 0, VERDICT_BONUS);
    add("secretDeed", deeds.get(id) ?? 0, SECRET_DEED_BONUS);
    add("guess", guessed ? 1 : 0, GUESS_BONUS);
    const parts = {
      live: (liveByMember.get(id) ?? []).reduce((sum, l) => sum + l.points, 0),
      hit: (hits.get(id) ?? 0) * HIT_BONUS,
      recognized: (recognized.get(id) ?? 0) * RECOGNIZED_BONUS,
      verdict: (verdictCounts.get(id) ?? 0) * VERDICT_BONUS,
      secretDeed: (deeds.get(id) ?? 0) * SECRET_DEED_BONUS,
      guess: guessed ? GUESS_BONUS : 0,
    };
    result.set(id, { ...parts, total: Object.values(parts).reduce((s, n) => s + n, 0), lines });
  }
  return result;
}

/** 모임 온도: 모두가 함께 만든 활동량으로 오른다. */
export async function temperature(db: Db, event: Event): Promise<number> {
  const [recordRows, reactionRows, missionRows, verdictRows, deedRows, memberRows] = await Promise.all([
    db.select({ id: records.id }).from(records).where(eq(records.eventId, event.id)),
    db
      .select({ id: reactions.recordId })
      .from(reactions)
      .innerJoin(records, eq(records.id, reactions.recordId))
      .where(eq(records.eventId, event.id)),
    db
      .select({ id: missionDeliveries.id })
      .from(missionDeliveries)
      .where(and(eq(missionDeliveries.eventId, event.id), isNotNull(missionDeliveries.completedAt))),
    db
      .select({ id: verdicts.recordId })
      .from(verdicts)
      .innerJoin(records, eq(records.id, verdicts.recordId))
      .where(eq(records.eventId, event.id)),
    db.select({ id: secretDeeds.id }).from(secretDeeds).where(eq(secretDeeds.eventId, event.id)),
    db.select({ id: participants.id }).from(participants).where(eq(participants.eventId, event.id)),
  ]);
  const activity =
    recordRows.length + reactionRows.length + missionRows.length + verdictRows.length + deedRows.length;
  const periodDays = Math.max(1, Math.ceil((event.endsAt.getTime() - event.startsAt.getTime()) / DAY_MS));
  const goal = memberRows.length * (periodDays * 2 + event.missionCount);
  if (goal <= 0) return BASE_TEMP;
  const raw = Math.min(MAX_TEMP, BASE_TEMP + ((MAX_TEMP - BASE_TEMP) * activity) / goal);
  return Math.round(raw * 10) / 10;
}
