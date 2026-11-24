import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { participants, type Event, type Participant } from "@/db/schema";
import { DomainError } from "@/domain/errors";
import { getEventByCode } from "@/domain/events";
import { advanceEvent } from "@/domain/lifecycle";
import { getLobby } from "@/domain/views";
import { createSessionToken, readSessionToken } from "./session";

const SESSION_DAYS = 90;
const CODE_PATTERN = /^[A-Z0-9]{4,16}$/;

/** 로그인 화면의 "이름 선택"에 내보내는 최소 정보. PIN 해시·잠금 정보는 담지 않는다. */
export type LoginCandidate = { id: string; name: string; needsNewPin: boolean };

const cookieName = (code: string) => `manito_${code}`;

async function findMember(db: Db, eventId: string, participantId: string): Promise<Participant | null> {
  const [p] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, participantId), eq(participants.eventId, eventId)));
  return p ?? null;
}

/**
 * 요청마다 한 번(React cache): 이벤트를 찾아 단계를 진행시킨 뒤,
 * 세션 쿠키가 이 이벤트에 지금도 남아 있는 참가자를 가리키면 `me`를 채운다.
 */
export const getViewer = cache(
  async (code: string): Promise<{ event: Event; me: Participant | null } | null> => {
    if (!CODE_PATTERN.test(code)) return null;
    const db = getDb();
    const found = await getEventByCode(db, code);
    if (!found) return null;
    const event = await advanceEvent(db, found.id, new Date());

    const token = (await cookies()).get(cookieName(event.code))?.value;
    const session = token ? await readSessionToken(token) : null;
    // 서명된 쿠키만으로는 부족하다: 내보내진 참가자일 수 있으므로 DB에서 다시 확인한다.
    const me =
      session && session.eventId === event.id ? await findMember(db, event.id, session.participantId) : null;
    return { event, me };
  },
);

/** 이벤트가 없으면 DomainError. */
export async function requireEvent(code: string): Promise<Event> {
  const viewer = await getViewer(code);
  if (!viewer) throw new DomainError("EVENT_NOT_FOUND", "이벤트를 찾을 수 없어요.");
  return viewer.event;
}

export async function requireMe(code: string): Promise<{ event: Event; me: Participant }> {
  const viewer = await getViewer(code);
  if (!viewer?.me) throw new DomainError("NOT_LOGGED_IN", "다시 입장해 주세요.");
  return { event: viewer.event, me: viewer.me };
}

/** 참가자가 이 이벤트 소속인지 확인한다. 다른 이벤트의 참가자 id로 로그인·PIN 설정을 시도하지 못하게 한다. */
export async function requireMember(event: Event, participantId: string): Promise<Participant> {
  const p = participantId ? await findMember(getDb(), event.id, participantId) : null;
  if (!p) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  return p;
}

export async function listLoginCandidates(eventId: string): Promise<LoginCandidate[]> {
  const db = getDb();
  const [lobby, resetRows] = await Promise.all([
    getLobby(db, eventId),
    db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.eventId, eventId), isNull(participants.pinHash))),
  ]);
  const needsNewPin = new Set(resetRows.map((r) => r.id));
  return lobby.participants.map((p) => ({ id: p.id, name: p.name, needsNewPin: needsNewPin.has(p.id) }));
}

export async function setSession(code: string, participant: Participant): Promise<void> {
  const token = await createSessionToken({ participantId: participant.id, eventId: participant.eventId });
  (await cookies()).set(cookieName(code), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}
