import { describe, expect, test } from "vitest";
import type { RevealData } from "@/domain/reveal";
import { AWARD_META, buildSlides } from "./slides";

const zeroScore = { live: 0, hit: 0, recognized: 0, verdict: 0, secretDeed: 0, guess: 0 };

function fixture(totals: number[]): RevealData {
  const people = totals.map((total, i) => ({ id: `p${i}`, name: `사람${i}`, total }));
  return {
    summary: { temperature: 40, recordCount: 3, missionsCompleted: 2 },
    chain: people.map((p, i) => ({
      receiver: { id: p.id, name: p.name },
      giver: { id: people[(i + 1) % people.length].id, name: people[(i + 1) % people.length].name },
      records: [],
      unnoticedDeeds: [],
      guess: null,
    })),
    scores: [...people]
      .sort((a, b) => b.total - a.total)
      .map((p) => ({ id: p.id, name: p.name, score: { ...zeroScore, total: p.total } })),
    awards: { nunchi: [], heotdari: [], shadow: [], mission: [] },
  };
}

describe("buildSlides", () => {
  test("5명이면 슬라이드는 1 + 10 + 3 = 14장이고 순서가 맞다", () => {
    const slides = buildSlides(fixture([50, 40, 30, 20, 10]));
    expect(slides).toHaveLength(14);
    expect(slides[0].kind).toBe("summary");
    for (let i = 0; i < 5; i++) {
      expect(slides[1 + 2 * i].kind).toBe("question");
      expect(slides[2 + 2 * i].kind).toBe("answer");
    }
    expect(slides.slice(11).map((s) => s.kind)).toEqual(["awards", "podium", "end"]);
  });

  test("question 다음 장은 같은 receiver의 answer다", () => {
    const data = fixture([50, 40, 30, 20, 10]);
    const slides = buildSlides(data);
    for (let i = 0; i < data.chain.length; i++) {
      const q = slides[1 + 2 * i];
      const a = slides[2 + 2 * i];
      if (q.kind !== "question" || a.kind !== "answer") throw new Error("순서가 틀렸어요");
      expect(q.receiverName).toBe(data.chain[i].receiver.name);
      expect(a.entry).toBe(data.chain[i]);
    }
  });

  test("podium: 3위 동점이면 4명", () => {
    const podium = buildSlides(fixture([50, 40, 30, 30, 10])).find((s) => s.kind === "podium");
    expect(podium?.kind === "podium" && podium.top.map((t) => t.total)).toEqual([50, 40, 30, 30]);
  });

  test("podium: 참가자가 4명이어도 상위 3명만", () => {
    const podium = buildSlides(fixture([50, 40, 30, 20])).find((s) => s.kind === "podium");
    expect(podium?.kind === "podium" && podium.top.map((t) => t.total)).toEqual([50, 40, 30]);
  });
});

test("시상 부문 이름은 스펙의 '그림자 마니또'를 쓴다", () => {
  expect(AWARD_META.find((a) => a.key === "shadow")?.title).toBe("그림자 마니또");
});
