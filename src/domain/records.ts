import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { participants, reactions, records, secretDeeds, verdicts, type Participant } from "@/db/schema";
import { BODY_MAX, REACTION_EMOJIS } from "./constants";
import { DomainError } from "./errors";
import { advanceEvent, getGiverIdOf } from "./lifecycle";

function validateBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > BODY_MAX) {
    throw new DomainError("INVALID_BODY", `1자 이상 ${BODY_MAX}자 이하로 적어 주세요.`);
  }
  return trimmed;
}

const recordNotFound = () => new DomainError("NOT_FOUND", "기록을 찾을 수 없어요.");

/** 참가자 확인 → advanceEvent → 진행 중 확인. */
async function requireActive(db: Db, participantId: string, now: Date): Promise<Participant> {
  const [participant] = await db.select().from(participants).where(eq(participants.id, participantId));
  if (!participant) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  const event = await advanceEvent(db, participant.eventId, now);
  if (event.status !== "active") {
    throw new DomainError("NOT_ACTIVE", "진행 중일 때만 할 수 있어요.");
  }
  return participant;
}

/** 같은 이벤트의 기록만 돌려준다. 없거나 다른 이벤트면 NOT_FOUND. */
async function findRecord(db: Db, eventId: string, recordId: string) {
  const [record] = await db.select().from(records).where(eq(records.id, recordId));
  if (!record || record.eventId !== eventId) throw recordNotFound();
  return record;
}

async function findOwnRecord(db: Db, author: Participant, recordId: string) {
  const record = await findRecord(db, author.eventId, recordId);
  if (record.authorId !== author.id) {
    throw new DomainError("NOT_YOURS", "내가 쓴 기록만 바꿀 수 있어요.");
  }
  return record;
}

export async function createRecord(
  db: Db,
  authorId: string,
  body: string,
  now: Date,
): Promise<{ id: string }> {
  const author = await requireActive(db, authorId, now);
  const text = validateBody(body);
  const [row] = await db
    .insert(records)
    .values({ eventId: author.eventId, authorId, body: text, createdAt: now, updatedAt: now })
    .returning({ id: records.id });
  return row;
}

export async function updateRecord(
  db: Db,
  authorId: string,
  recordId: string,
  body: string,
  now: Date,
): Promise<void> {
  const author = await requireActive(db, authorId, now);
  const text = validateBody(body);
  await findOwnRecord(db, author, recordId);
  await db.update(records).set({ body: text, updatedAt: now }).where(eq(records.id, recordId));
}

export async function deleteRecord(
  db: Db,
  authorId: string,
  recordId: string,
  now: Date,
): Promise<void> {
  const author = await requireActive(db, authorId, now);
  await findOwnRecord(db, author, recordId);
  // verdicts, reactions는 외래 키 cascade로 함께 지워진다.
  await db.delete(records).where(eq(records.id, recordId));
}

export async function toggleReaction(
  db: Db,
  participantId: string,
  recordId: string,
  emoji: string,
  now: Date,
): Promise<void> {
  const participant = await requireActive(db, participantId, now);
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    throw new DomainError("INVALID_EMOJI", "사용할 수 없는 이모지예요.");
  }
  await findRecord(db, participant.eventId, recordId);
  const key = and(
    eq(reactions.recordId, recordId),
    eq(reactions.participantId, participantId),
    eq(reactions.emoji, emoji),
  );
  const removed = await db.delete(reactions).where(key).returning({ id: reactions.recordId });
  if (removed.length === 0) {
    await db.insert(reactions).values({ recordId, participantId, emoji }).onConflictDoNothing();
  }
}

/** 기록 작성자의 마니또만 판정할 수 있다. 그 외에는 기록이 없는 것과 같은 NOT_FOUND로 답한다. */
export async function setVerdict(
  db: Db,
  judgeId: string,
  recordId: string,
  isMine: boolean,
  now: Date,
): Promise<void> {
  const judge = await requireActive(db, judgeId, now);
  const record = await findRecord(db, judge.eventId, recordId);
  const manitoId = await getGiverIdOf(db, record.authorId);
  if (manitoId !== judgeId) throw recordNotFound();
  await db
    .insert(verdicts)
    .values({ recordId, isMine, decidedAt: now })
    .onConflictDoUpdate({ target: verdicts.recordId, set: { isMine, decidedAt: now } });
}

export async function addSecretDeed(
  db: Db,
  giverId: string,
  body: string,
  now: Date,
): Promise<{ id: string }> {
  const giver = await requireActive(db, giverId, now);
  const text = validateBody(body);
  const [row] = await db
    .insert(secretDeeds)
    .values({ eventId: giver.eventId, giverId, body: text, createdAt: now })
    .returning({ id: secretDeeds.id });
  return row;
}

export async function deleteSecretDeed(
  db: Db,
  giverId: string,
  deedId: string,
  now: Date,
): Promise<void> {
  const giver = await requireActive(db, giverId, now);
  const [deed] = await db.select().from(secretDeeds).where(eq(secretDeeds.id, deedId));
  if (!deed || deed.eventId !== giver.eventId) {
    throw new DomainError("NOT_FOUND", "몰래 한 일을 찾을 수 없어요.");
  }
  if (deed.giverId !== giverId) {
    throw new DomainError("NOT_YOURS", "내가 적은 것만 지울 수 있어요.");
  }
  await db.delete(secretDeeds).where(eq(secretDeeds.id, deedId));
}
