import { describe, expect, test } from "vitest";
import { ddayLabel, formatKst, formatTemp, parseKstInput, toKstInput } from "./format";

describe("formatKst", () => {
  test("formatKst(2026-12-03T05:20:00Z) === '12월 3일 14:20'", () => {
    expect(formatKst(new Date("2026-12-03T05:20:00Z"))).toBe("12월 3일 14:20");
  });

  test("KST 기준으로 날짜가 넘어간다", () => {
    expect(formatKst(new Date("2026-12-31T15:05:00Z"))).toBe("1월 1일 00:05");
  });
});

describe("ddayLabel", () => {
  test("ddayLabel(9) === 'D-9', ddayLabel(0) === 'D-DAY'", () => {
    expect(ddayLabel(9)).toBe("D-9");
    expect(ddayLabel(0)).toBe("D-DAY");
  });
});

describe("formatTemp", () => {
  test("formatTemp(52.5) === '52.5℃', formatTemp(40) === '40.0℃'", () => {
    expect(formatTemp(52.5)).toBe("52.5℃");
    expect(formatTemp(40)).toBe("40.0℃");
  });
});

describe("datetime-local 입력값", () => {
  test("입력값을 KST 벽시계 시각으로 해석한다", () => {
    expect(parseKstInput("2026-12-03T14:20")?.toISOString()).toBe("2026-12-03T05:20:00.000Z");
  });

  test("형식이 틀리거나 비어 있으면 null", () => {
    expect(parseKstInput("")).toBeNull();
    expect(parseKstInput("2026-13-40T99:99")).toBeNull();
    expect(parseKstInput("2026-12-03T14:20+00:00")).toBeNull();
  });

  test("toKstInput은 parseKstInput의 역이다", () => {
    expect(toKstInput(new Date("2026-12-03T05:20:00Z"))).toBe("2026-12-03T14:20");
  });
});
