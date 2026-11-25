import { SCORE_RULES, type ScoreLine } from "@/domain/scoring";

const LABEL = new Map(SCORE_RULES.map((r) => [r.key, r.label]));

/** 한 사람의 점수 내역. 점수가 붙은 항목만 "기록 3개 30점"처럼 나열한다. */
export function ScoreLines({ lines }: { lines: ScoreLine[] }) {
  if (lines.length === 0) {
    return <p className="text-xs text-ink-soft">아직 받은 점수가 없어요.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
      {lines.map((l) => (
        <li key={l.key}>
          {LABEL.get(l.key)}
          {l.key !== "guess" && ` ${l.count}개`} <strong className="font-semibold text-ink">{l.points}점</strong>
          {l.skipped ? ` (하루 한도를 넘은 ${l.skipped}개는 점수 없음)` : ""}
        </li>
      ))}
    </ul>
  );
}
