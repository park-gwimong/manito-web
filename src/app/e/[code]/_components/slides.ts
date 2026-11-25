import type { RevealData } from "@/domain/reveal";

export type Slide =
  | { kind: "summary"; summary: RevealData["summary"] }
  | { kind: "question"; receiverName: string }
  | { kind: "answer"; entry: RevealData["chain"][number] }
  | { kind: "awards"; awards: RevealData["awards"] }
  | { kind: "podium"; top: { name: string; total: number }[] }
  | { kind: "end" };

const PODIUM_SIZE = 3;

/** 상위 3명. 3위와 같은 점수는 모두 포함한다. 순위 숫자는 만들지 않는다. */
function podium(scores: RevealData["scores"]): { name: string; total: number }[] {
  const sorted = [...scores].sort((a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name));
  if (sorted.length <= PODIUM_SIZE) return sorted.map((s) => ({ name: s.name, total: s.score.total }));
  const cutoff = sorted[PODIUM_SIZE - 1].score.total;
  return sorted.filter((s) => s.score.total >= cutoff).map((s) => ({ name: s.name, total: s.score.total }));
}

/** 순서: summary, (question, answer)×인원수, awards, podium, end */
export function buildSlides(data: RevealData): Slide[] {
  return [
    { kind: "summary", summary: data.summary },
    ...data.chain.flatMap((entry): Slide[] => [
      { kind: "question", receiverName: entry.receiver.name },
      { kind: "answer", entry },
    ]),
    { kind: "awards", awards: data.awards },
    { kind: "podium", top: podium(data.scores) },
    { kind: "end" },
  ];
}

/** 시상 부문. 발표와 결과 화면이 같은 이름·설명을 쓴다. */
export const AWARD_META: { key: keyof RevealData["awards"]; title: string; desc: string }[] = [
  { key: "nunchi", title: "눈치왕", desc: "받은 마음을 가장 잘 알아챈 사람" },
  { key: "heotdari", title: "헛다리왕", desc: "엉뚱한 곳에서 마음을 찾은 사람" },
  { key: "shadow", title: "그림자 마니또", desc: "가장 여러 날 몰래 챙긴 사람" },
  { key: "mission", title: "미션왕", desc: "미션을 가장 많이 해낸 사람" },
];

/** 기록 하나에 대한 마니또의 판정. null은 판정하지 않은 기록. */
export function resultLabel(result: boolean | null): string {
  return result === true ? "맞음" : result === false ? "아님" : "미확인";
}
