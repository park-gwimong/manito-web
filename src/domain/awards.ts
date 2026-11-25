/**
 * 시상 부문마다 수상자 한 명을 정한다. DB를 쓰지 않는 순수 계산이다.
 *
 * 수가 가장 많은 사람이 받는다. 같은 사람이 여럿이면 차례로 본다.
 *  1. 그 부문에 맞는 기준 (아래 `AWARDS`의 `tieBreaks`)
 *  2. 아직 다른 상을 받지 않은 사람 (상이 여러 사람에게 돌아가게)
 *  3. 그 수에 먼저 도달한 사람
 *  4. 먼저 참가한 사람 (여기까지 오는 일은 거의 없다)
 * 추첨은 하지 않는다. 최종 점수도 보지 않는다(상이 순위를 따라가지 않게).
 */
export type AwardKey = "nunchi" | "heotdari" | "mission";

export type AwardStats = {
  id: string;
  /** 마니또가 `맞아요`라고 답한 내 기록 수와, 그 수에 도달한 시각(마지막 그 기록을 쓴 때). */
  hits: number;
  lastHitAt: number | null;
  /** 마니또가 `제가 아니에요`라고 답한 내 기록 수와, 그 수에 도달한 시각. */
  misses: number;
  lastMissAt: number | null;
  /** 내 마니또를 맞혔는지. 추측하지 않았으면 false. */
  guessedRight: boolean;
  /** 받은 미션 수, 완료한 미션 수, 마지막으로 완료한 시각. */
  missionsDelivered: number;
  missionsDone: number;
  lastMissionAt: number | null;
};

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** 부문 순서가 곧 정하는 순서다. 앞 부문에서 받은 사람은 뒤 부문의 동점에서 양보한다. */
const AWARDS: {
  key: AwardKey;
  count: (s: AwardStats) => number;
  /** 클수록 유리한 값들. 앞의 것부터 본다. */
  tieBreaks: ((s: AwardStats) => number)[];
  reachedAt: (s: AwardStats) => number | null;
}[] = [
  {
    key: "nunchi",
    count: (s) => s.hits,
    // 적중률이 높은 사람, 그다음 내 마니또를 맞힌 사람
    tieBreaks: [(s) => ratio(s.hits, s.hits + s.misses), (s) => (s.guessedRight ? 1 : 0)],
    reachedAt: (s) => s.lastHitAt,
  },
  {
    key: "heotdari",
    count: (s) => s.misses,
    // 헛다리 비율이 높은 사람, 그다음 내 마니또를 못 맞힌 사람
    tieBreaks: [(s) => ratio(s.misses, s.hits + s.misses), (s) => (s.guessedRight ? 0 : 1)],
    reachedAt: (s) => s.lastMissAt,
  },
  {
    key: "mission",
    count: (s) => s.missionsDone,
    // 받은 미션 중 완료한 비율이 높은 사람
    tieBreaks: [(s) => ratio(s.missionsDone, s.missionsDelivered)],
    reachedAt: (s) => s.lastMissionAt,
  },
];

/** `stats`는 참가한 순서대로 넘긴다. 부문마다 수상자의 id, 해당자가 없으면 null. */
export function decideAwards(stats: AwardStats[]): Record<AwardKey, string | null> {
  const awarded = new Set<string>();
  const result: Record<AwardKey, string | null> = { nunchi: null, heotdari: null, mission: null };

  for (const award of AWARDS) {
    const max = Math.max(0, ...stats.map(award.count));
    if (max === 0) continue;
    const joinOrder = (s: AwardStats) => stats.indexOf(s);
    const [winner] = stats
      .filter((s) => award.count(s) === max)
      .sort((a, b) => {
        for (const key of award.tieBreaks) {
          const diff = key(b) - key(a);
          if (diff !== 0) return diff;
        }
        const fresh = Number(awarded.has(a.id)) - Number(awarded.has(b.id));
        if (fresh !== 0) return fresh;
        const reached = (award.reachedAt(a) ?? Infinity) - (award.reachedAt(b) ?? Infinity);
        if (reached !== 0 && !Number.isNaN(reached)) return reached;
        return joinOrder(a) - joinOrder(b);
      });
    result[award.key] = winner.id;
    awarded.add(winner.id);
  }
  return result;
}
