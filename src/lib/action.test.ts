import { afterEach, describe, expect, test, vi } from "vitest";
import { DomainError } from "@/domain/errors";
import { runAction } from "./action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAction", () => {
  test("성공하면 ok: true", async () => {
    await expect(runAction(async () => {})).resolves.toEqual({ ok: true });
  });

  test("DomainError는 message를 error로 돌려준다", async () => {
    const result = await runAction(async () => {
      throw new DomainError("NAME_TAKEN", "이미 사용 중인 이름이에요.");
    });
    expect(result).toEqual({ ok: false, error: "이미 사용 중인 이름이에요." });
  });

  test("그 밖의 오류는 '잠시 후 다시 시도해 주세요.'", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("connection refused");
    const result = await runAction(async () => {
      throw boom;
    });
    expect(result).toEqual({ ok: false, error: "잠시 후 다시 시도해 주세요." });
    expect(log).toHaveBeenCalledWith(expect.any(String), boom);
  });
});
