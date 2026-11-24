import { SignJWT, jwtVerify } from "jose";

export type SessionPayload = { participantId: string; eventId: string };

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

/** 변조되었거나 만료된 토큰은 null. */
export async function readSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { participantId, eventId } = payload;
    if (typeof participantId !== "string" || typeof eventId !== "string") return null;
    return { participantId, eventId };
  } catch {
    return null;
  }
}
