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

test("토큰을 만들고 다시 읽는다", async () => {
  const token = await createSessionToken(payload);
  expect(await readSessionToken(token)).toEqual(payload);
});

test("한 글자 바꾼 토큰은 null", async () => {
  const token = await createSessionToken(payload);
  const last = token.slice(-1);
  const tampered = token.slice(0, -1) + (last === "A" ? "B" : "A");
  expect(await readSessionToken(tampered)).toBeNull();
});

test("다른 비밀키로 만든 토큰은 null", async () => {
  const token = await createSessionToken(payload);
  process.env.SESSION_SECRET = "another-secret-another-secret-123";
  expect(await readSessionToken(token)).toBeNull();
});
