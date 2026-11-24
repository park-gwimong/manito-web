import { afterEach, beforeEach, expect, test } from "vitest";
import { createSessionToken, readSessionToken } from "./session";

const original = process.env.SESSION_SECRET;
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
});
afterEach(() => {
  if (original === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = original;
});

const payload = { participantId: "p-1", eventId: "e-1" };

test("토큰을 만들고 다시 읽으면 발급 시각(초 단위)도 함께 돌려준다", async () => {
  const before = Math.floor(Date.now() / 1000) * 1000;
  const token = await createSessionToken(payload);
  const after = Date.now();
  const read = await readSessionToken(token);
  expect(read).toEqual({ ...payload, issuedAt: expect.any(Date) });
  expect(read!.issuedAt.getTime()).toBeGreaterThanOrEqual(before);
  expect(read!.issuedAt.getTime()).toBeLessThanOrEqual(after);
});

test("한 글자 바꾼 토큰은 null", async () => {
  const token = await createSessionToken(payload);
  // 서명 중간의 글자를 바꾼다(마지막 글자는 유효 비트가 4개뿐이라 바꿔도 같은 값일 수 있다).
  const i = token.length - 10;
  const tampered = token.slice(0, i) + (token[i] === "A" ? "B" : "A") + token.slice(i + 1);
  expect(await readSessionToken(tampered)).toBeNull();
});

test("다른 비밀키로 만든 토큰은 null", async () => {
  const token = await createSessionToken(payload);
  process.env.SESSION_SECRET = "another-secret-another-secret-123";
  expect(await readSessionToken(token)).toBeNull();
});
