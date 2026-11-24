import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { createTestDb } from "./test-db";
import { events, participants, records, reactions, verdicts } from "./schema";

const eventValues = {
  code: "abcd1234",
  name: "연말",
  startsAt: new Date("2026-12-01T00:00:00+09:00"),
  endsAt: new Date("2026-12-24T00:00:00+09:00"),
  missionCount: 5,
};

test("빈 테스트 DB에 이벤트를 넣고 읽는다", async () => {
  const db = await createTestDb();
  await db.insert(events).values(eventValues);
  const [row] = await db.select().from(events);
  expect(row.status).toBe("preparing");
  expect(row.startMissedAt).toBeNull();
});

test("같은 이벤트에 같은 이름은 DB에서 거부된다", async () => {
  const db = await createTestDb();
  const [ev] = await db.insert(events).values(eventValues).returning();
  await db.insert(participants).values({ eventId: ev.id, name: "민수" });
  await expect(
    db.insert(participants).values({ eventId: ev.id, name: "민수" }),
  ).rejects.toThrow();
});

test("기록을 지우면 판정과 반응도 지워진다", async () => {
  const db = await createTestDb();
  const [ev] = await db.insert(events).values(eventValues).returning();
  const [p] = await db.insert(participants).values({ eventId: ev.id, name: "민수" }).returning();
  const [rec] = await db
    .insert(records)
    .values({ eventId: ev.id, authorId: p.id, body: "오늘의 기록" })
    .returning();
  await db.insert(verdicts).values({ recordId: rec.id, isMine: true });
  await db.insert(reactions).values({ recordId: rec.id, participantId: p.id, emoji: "👍" });

  await db.delete(records).where(eq(records.id, rec.id));

  expect(await db.select().from(verdicts)).toHaveLength(0);
  expect(await db.select().from(reactions)).toHaveLength(0);
});
