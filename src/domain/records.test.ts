import { beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { events, reactions, records, secretDeeds, verdicts, type Participant } from "@/db/schema";
import { createEvent } from "./events";
import { joinEvent } from "./participants";
import { advanceEvent, getGiverIdOf } from "./lifecycle";
import {
  addSecretDeed,
  createRecord,
  deleteRecord,
  deleteSecretDeed,
  setVerdict,
  toggleReaction,
  updateRecord,
} from "./records";

const now = new Date("2026-11-24T00:00:00Z");
const days = (d: number) => new Date(now.getTime() + d * 86_400_000);
const startsAt = days(1);
const during = days(2);

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup(start = true) {
  const { event, organizer } = await createEvent(
    db,
    {
      name: "테스트",
      startsAt,
      endsAt: days(11),
      missionCount: 5,
      organizerName: "개설자",
      organizerPin: "0000",
    },
    now,
  );
  const members: Participant[] = [organizer];
  for (let i = 1; i < 4; i++) {
    members.push(await joinEvent(db, event.id, { name: `참가자${i}`, pin: "1234" }, now));
  }
  if (start) await advanceEvent(db, event.id, startsAt);
  return { event, members };
}

/** author의 마니또, author와 무관한 제3자를 찾는다. */
async function rolesFor(members: Participant[], author: Participant) {
  const manitoId = (await getGiverIdOf(db, author.id))!;
  const manito = members.find((m) => m.id === manitoId)!;
  const third = members.find((m) => m.id !== author.id && m.id !== manitoId)!;
  return { manito, third };
}

const recordRows = (id: string) => db.select().from(records).where(eq(records.id, id));

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ name: "DomainError", code });
}

test("시작 전 기록은 NOT_ACTIVE", async () => {
  const { members } = await setup(false);
  await expectCode(createRecord(db, members[0].id, "안녕", now), "NOT_ACTIVE");
});

test("종료 시각이 지난 뒤 첫 요청이 기록 작성이면 NOT_ACTIVE이고 이벤트는 closed", async () => {
  const { event, members } = await setup(false);
  await expectCode(createRecord(db, members[0].id, "안녕", days(30)), "NOT_ACTIVE");
  const [row] = await db.select().from(events).where(eq(events.id, event.id));
  expect(row.status).toBe("closed");
});

test("기록 작성은 공백을 다듬어 저장한다", async () => {
  const { members } = await setup();
  const { id } = await createRecord(db, members[0].id, "  오늘 커피 줬다  ", during);
  const [row] = await recordRows(id);
  expect(row.body).toBe("오늘 커피 줬다");
  expect(row.authorId).toBe(members[0].id);
});

test("공백뿐인 기록, 501자 기록은 INVALID_BODY", async () => {
  const { members } = await setup();
  await expectCode(createRecord(db, members[0].id, "   ", during), "INVALID_BODY");
  await expectCode(createRecord(db, members[0].id, "가".repeat(501), during), "INVALID_BODY");
  await expect(createRecord(db, members[0].id, "가".repeat(500), during)).resolves.toBeTruthy();
});

test("작성자는 기록을 수정할 수 있고 판정은 유지된다", async () => {
  const { members } = await setup();
  const author = members[0];
  const { manito } = await rolesFor(members, author);
  const { id } = await createRecord(db, author.id, "처음", during);
  await setVerdict(db, manito.id, id, true, during);
  await updateRecord(db, author.id, id, " 고침 ", during);
  expect((await recordRows(id))[0].body).toBe("고침");
  expect(await db.select().from(verdicts).where(eq(verdicts.recordId, id))).toHaveLength(1);
});

test("남의 기록 수정·삭제는 NOT_YOURS", async () => {
  const { members } = await setup();
  const { id } = await createRecord(db, members[0].id, "내 것", during);
  await expectCode(updateRecord(db, members[1].id, id, "가로채기", during), "NOT_YOURS");
  await expectCode(deleteRecord(db, members[1].id, id, during), "NOT_YOURS");
  expect(await recordRows(id)).toHaveLength(1);
});

test("없는 기록과 다른 이벤트의 기록은 NOT_FOUND", async () => {
  const a = await setup();
  const b = await setup();
  const { id } = await createRecord(db, b.members[0].id, "다른 이벤트", during);
  const missing = "00000000-0000-4000-8000-000000000000";
  await expectCode(updateRecord(db, a.members[0].id, missing, "x", during), "NOT_FOUND");
  await expectCode(deleteRecord(db, a.members[0].id, id, during), "NOT_FOUND");
  await expectCode(toggleReaction(db, a.members[0].id, id, "👍", during), "NOT_FOUND");
  await expectCode(setVerdict(db, a.members[0].id, id, true, during), "NOT_FOUND");
});

test("마니또만 판정할 수 있다: 제3자와 작성자 본인은 NOT_FOUND", async () => {
  const { members } = await setup();
  const author = members[0];
  const { manito, third } = await rolesFor(members, author);
  const { id } = await createRecord(db, author.id, "기록", during);
  const missing = "00000000-0000-4000-8000-000000000000";

  await expect(setVerdict(db, third.id, id, true, during)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(setVerdict(db, author.id, id, true, during)).rejects.toMatchObject({ code: "NOT_FOUND" });
  // 존재하지 않는 기록과 구분되지 않는다.
  const notMine = await setVerdict(db, third.id, id, true, during).catch((e) => e);
  const absent = await setVerdict(db, third.id, missing, true, during).catch((e) => e);
  expect(notMine.message).toBe(absent.message);
  expect(await db.select().from(verdicts).where(eq(verdicts.recordId, id))).toHaveLength(0);

  await setVerdict(db, manito.id, id, true, during);
  expect(await db.select().from(verdicts).where(eq(verdicts.recordId, id))).toHaveLength(1);
});

test("판정을 맞아요→아니에요로 바꾸면 한 건만 남고 값이 바뀐다", async () => {
  const { members } = await setup();
  const author = members[0];
  const { manito } = await rolesFor(members, author);
  const { id } = await createRecord(db, author.id, "기록", during);
  await setVerdict(db, manito.id, id, true, during);
  await setVerdict(db, manito.id, id, false, days(3));
  const rows = await db.select().from(verdicts).where(eq(verdicts.recordId, id));
  expect(rows).toHaveLength(1);
  expect(rows[0].isMine).toBe(false);
});

test("판정·반응이 달린 기록을 지우면 verdicts, reactions가 비워진다", async () => {
  const { members } = await setup();
  const author = members[0];
  const { manito, third } = await rolesFor(members, author);
  const { id } = await createRecord(db, author.id, "기록", during);
  await setVerdict(db, manito.id, id, true, during);
  await toggleReaction(db, third.id, id, "👍", during);
  await deleteRecord(db, author.id, id, during);
  expect(await recordRows(id)).toHaveLength(0);
  expect(await db.select().from(verdicts).where(eq(verdicts.recordId, id))).toHaveLength(0);
  expect(await db.select().from(reactions).where(eq(reactions.recordId, id))).toHaveLength(0);
});

test("같은 이모지를 두 번 누르면 사라지고 다른 이모지는 따로 쌓인다", async () => {
  const { members } = await setup();
  const { id } = await createRecord(db, members[0].id, "기록", during);
  const mine = () => db.select().from(reactions).where(eq(reactions.recordId, id));
  await toggleReaction(db, members[1].id, id, "👍", during);
  expect(await mine()).toHaveLength(1);
  await toggleReaction(db, members[1].id, id, "❤️", during);
  expect(await mine()).toHaveLength(2);
  await toggleReaction(db, members[1].id, id, "👍", during);
  expect((await mine()).map((r) => r.emoji)).toEqual(["❤️"]);
});

test("허용되지 않은 이모지 '💩'는 INVALID_EMOJI", async () => {
  const { members } = await setup();
  const { id } = await createRecord(db, members[0].id, "기록", during);
  await expectCode(toggleReaction(db, members[1].id, id, "💩", during), "INVALID_EMOJI");
});

test("몰래 한 일 추가·삭제, 남의 것 삭제는 NOT_YOURS", async () => {
  const { members } = await setup();
  await expectCode(addSecretDeed(db, members[0].id, " ", during), "INVALID_BODY");
  const { id } = await addSecretDeed(db, members[0].id, " 몰래 청소 ", during);
  const [deed] = await db.select().from(secretDeeds).where(eq(secretDeeds.id, id));
  expect(deed.body).toBe("몰래 청소");
  await expectCode(deleteSecretDeed(db, members[1].id, id, during), "NOT_YOURS");
  await deleteSecretDeed(db, members[0].id, id, during);
  expect(await db.select().from(secretDeeds).where(eq(secretDeeds.id, id))).toHaveLength(0);
  await expectCode(deleteSecretDeed(db, members[0].id, id, during), "NOT_FOUND");
});

test("진행 중이 아니면 반응·판정·몰래 한 일도 NOT_ACTIVE", async () => {
  const { members } = await setup();
  const { id } = await createRecord(db, members[0].id, "기록", during);
  const after = days(30);
  await expectCode(toggleReaction(db, members[1].id, id, "👍", after), "NOT_ACTIVE");
  await expectCode(addSecretDeed(db, members[1].id, "x", after), "NOT_ACTIVE");
});
