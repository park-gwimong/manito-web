import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { notifications, pushSubscriptions } from "@/db/schema";
import { createEvent } from "@/domain/events";
import { enqueue, saveSubscription } from "@/domain/notifications";

const send = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification: send } }));

import { flushNotifications, pushPublicKey } from "./push";

const now = new Date("2026-11-24T00:00:00Z");
let db: Db;
let eventId: string;
let code: string;
let me: string;

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  send.mockReset();
  await db.delete(notifications);
  const { event, organizer } = await createEvent(
    db,
    {
      name: "알림 테스트",
      startsAt: new Date(now.getTime() + 3_600_000),
      endsAt: new Date(now.getTime() + 7_200_000),
      missionCount: 1,
      organizerName: "개설자",
      organizerPin: "0000",
    },
    now,
  );
  eventId = event.id;
  code = event.code;
  me = organizer.id;
  await saveSubscription(db, me, { endpoint: "https://push.example/me", p256dh: "p", auth: "a" });
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

test("쌓인 알림을 구독 주소로 보내고 대기열을 비운다", async () => {
  send.mockResolvedValue({});
  await enqueue(db, eventId, [me], "mission");
  expect(await flushNotifications(db)).toBe(1);
  const [subscription, payload, options] = send.mock.calls[0];
  expect(subscription).toEqual({ endpoint: "https://push.example/me", keys: { p256dh: "p", auth: "a" } });
  expect(JSON.parse(payload)).toEqual({
    title: "알림 테스트",
    body: "새 미션이 도착했어요.",
    url: `/e/${code}/duty`,
  });
  expect(options.vapidDetails).toMatchObject({ publicKey: "pub", privateKey: "priv" });
  expect(await db.select().from(notifications)).toHaveLength(0);
  expect(await flushNotifications(db)).toBe(0);
});

test("푸시 서버가 없는 주소라고 답하면 그 구독을 지운다", async () => {
  send.mockRejectedValue({ statusCode: 410 });
  await enqueue(db, eventId, [me], "closed");
  expect(await flushNotifications(db)).toBe(0);
  const left = await db.select().from(pushSubscriptions);
  expect(left.some((s) => s.endpoint === "https://push.example/me")).toBe(false);
});

test("키가 없으면 보내지 않지만 대기열은 비운다", async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "");
  expect(pushPublicKey()).toBeNull();
  await enqueue(db, eventId, [me], "started");
  expect(await flushNotifications(db)).toBe(0);
  expect(send).not.toHaveBeenCalled();
  expect(await db.select().from(notifications)).toHaveLength(0);
});
