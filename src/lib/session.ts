import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = { participantId: string; eventId: string };
/** 읽은 세션. `issuedAt`은 토큰의 iat(초 단위)이다. */
export type ReadSession = SessionPayload & { issuedAt: Date };

const SESSION_DAYS = 90;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET 환경 변수가 설정되지 않았습니다.");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ participantId: payload.participantId, eventId: payload.eventId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

/** 변조되었거나 만료되었거나 발급 시각이 없는 토큰은 null. */
export async function readSessionToken(token: string): Promise<ReadSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { participantId, eventId, iat } = payload;
    if (typeof participantId !== "string" || typeof eventId !== "string" || typeof iat !== "number") return null;
    return { participantId, eventId, issuedAt: new Date(iat * 1000) };
  } catch {
    return null;
  }
}
