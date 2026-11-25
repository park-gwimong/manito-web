import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events } from "@/db/schema";
import { createEvent } from "@/domain/events";
import { DEMO_REFRESH_MS, DEMO_STAGES, refreshDemoEvents } from "./demo-seed";
import { canTour, getDevOverview, isTourable } from "./overview";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

test("둘러보기는 기본으로 꺼져 있다", async () => {
  expect(canTour()).toBe(false);
  await expect(getDevOverview(db)).rejects.toThrow();
  expect(isTourable({ demoSeededAt: new Date() })).toBe(false);
});

test("운영에서 켜면 샘플만 만들고, 샘플만 보여 주고, 실제 이벤트는 건드리지 않는다", { timeout: 120_000 }, async () => {
  vi.stubEnv("DEMO_MODE", "1");
  const now = new Date();
  const { event: real } = await createEvent(
    db,
    {
      name: "실제 모임",
      startsAt: new Date(now.getTime() + 86_400_000),
      endsAt: new Date(now.getTime() + 5 * 86_400_000),
      missionCount: 3,
      organizerName: "개설자",
      organizerPin: "1234",
    },
    now,
  );

  expect(await refreshDemoEvents(db, now)).toBe(true);
  const demos = await db.select().from(events).where(isNotNull(events.demoSeededAt));
  expect(demos.map((e) => e.status).sort()).toEqual([...DEMO_STAGES].sort());

  // 실제 이벤트는 화면에도 안 나오고, PIN 없이 들어갈 수도 없다.
  const overview = await getDevOverview(db);
  expect(overview).toHaveLength(DEMO_STAGES.length);
  expect(overview.some((e) => e.id === real.id)).toBe(false);
  expect(isTourable(real)).toBe(false);
  expect(isTourable(demos[0])).toBe(true);

  // 하루가 안 지났으면 그대로 둔다.
  expect(await refreshDemoEvents(db, new Date(Date.now() + DEMO_REFRESH_MS / 2))).toBe(false);

  // 하루가 지나면 샘플만 지우고 다시 만든다.
  expect(await refreshDemoEvents(db, new Date(Date.now() + DEMO_REFRESH_MS + 60_000))).toBe(true);
  const after = await db.select().from(events).where(isNotNull(events.demoSeededAt));
  expect(after).toHaveLength(DEMO_STAGES.length);
  expect(after.some((e) => demos.some((d) => d.id === e.id))).toBe(false);
  const reals = await db.select().from(events).where(isNull(events.demoSeededAt));
  expect(reals.map((e) => e.id)).toEqual([real.id]);
});
