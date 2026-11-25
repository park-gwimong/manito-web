import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { events, notifications, participants, pushSubscriptions, type NotificationKind } from "@/db/schema";
import { DomainError } from "./errors";

/** 트랜잭션 안에서도 쓸 수 있도록 insert만 요구한다. */
type Inserter = Pick<Db, "insert">;

/** 보낼 알림을 쌓는다. 일이 생긴 트랜잭션 안에서 불러, 일이 취소되면 알림도 함께 사라지게 한다. */
export async function enqueue(
  db: Inserter,
  eventId: string,
  participantIds: string[],
  kind: NotificationKind,
): Promise<void> {
  const unique = [...new Set(participantIds)];
  if (unique.length === 0) return;
  await db.insert(notifications).values(unique.map((participantId) => ({ eventId, participantId, kind })));
}

/**
 * 알림 글귀. 잠금 화면에 그대로 뜨므로 대상이 누구인지 짐작할 수 있는 이름은 절대 넣지 않는다.
 * `path`는 이벤트 주소(`/e/CODE`) 뒤에 붙는 경로다.
 */
export const NOTIFICATION_TEXT: Record<NotificationKind, { body: string; path: string }> = {
  started: { body: "마니또가 시작됐어요. 내가 챙길 사람을 확인해 보세요.", path: "/duty" },
  mission: { body: "새 미션이 도착했어요.", path: "/duty" },
  record: { body: "내가 챙기는 사람이 새 기록을 남겼어요.", path: "/duty" },
  closed: { body: "마니또가 끝났어요. 내 마니또가 누구였을지 맞혀 보세요.", path: "" },
  presentation: { body: "결과 발표가 시작됐어요.", path: "" },
  reassigned: { body: "내가 챙길 사람이 바뀌었어요. 내 임무에서 확인해 보세요.", path: "/duty" },
};

export type Subscription = { endpoint: string; p256dh: string; auth: string };

export type OutgoingPush = {
  subscription: Subscription;
  title: string;
  body: string;
  url: string;
};

/**
 * 쌓인 알림을 모두 꺼내(지우고) 보낼 목록으로 바꾼다. 꺼낸 뒤에는 다시 보내지 않는다(최대 한 번).
 * 알림을 켠 브라우저가 없는 참가자의 알림은 그대로 버려진다.
 */
export async function takePending(db: Db): Promise<OutgoingPush[]> {
  const taken = await db.delete(notifications).returning();
  if (taken.length === 0) return [];
  const participantIds = [...new Set(taken.map((n) => n.participantId))];
  const eventIds = [...new Set(taken.map((n) => n.eventId))];
  const [subs, eventRows] = await Promise.all([
    db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.participantId, participantIds)),
    db.select({ id: events.id, code: events.code, name: events.name }).from(events).where(inArray(events.id, eventIds)),
  ]);
  if (subs.length === 0) return [];
  const eventOf = new Map(eventRows.map((e) => [e.id, e]));

  const seen = new Set<string>();
  const out: OutgoingPush[] = [];
  for (const n of taken) {
    // 같은 사람에게 같은 종류가 여러 번 쌓였으면 한 번만 보낸다.
    const key = `${n.participantId}:${n.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const event = eventOf.get(n.eventId);
    if (!event) continue;
    const text = NOTIFICATION_TEXT[n.kind];
    for (const s of subs) {
      if (s.participantId !== n.participantId) continue;
      out.push({
        subscription: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        title: event.name,
        body: text.body,
        url: `/e/${event.code}${text.path}`,
      });
    }
  }
  return out;
}

const MAX_FIELD = 2048;

export async function saveSubscription(db: Db, participantId: string, sub: Subscription): Promise<void> {
  const ok =
    /^https:\/\//.test(sub.endpoint) &&
    [sub.endpoint, sub.p256dh, sub.auth].every((v) => typeof v === "string" && v.length > 0 && v.length <= MAX_FIELD);
  if (!ok) throw new DomainError("INVALID_SUBSCRIPTION", "알림을 켜지 못했어요. 다시 시도해 주세요.");
  const [p] = await db.select({ id: participants.id }).from(participants).where(eq(participants.id, participantId));
  if (!p) throw new DomainError("PARTICIPANT_NOT_FOUND", "참가자를 찾을 수 없어요.");
  await db
    .insert(pushSubscriptions)
    .values({ participantId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth })
    .onConflictDoUpdate({
      target: [pushSubscriptions.participantId, pushSubscriptions.endpoint],
      set: { p256dh: sub.p256dh, auth: sub.auth },
    });
}

export async function removeSubscription(db: Db, participantId: string, endpoint: string): Promise<void> {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.participantId, participantId));
  const mine = rows.filter((r) => r.endpoint === endpoint).map((r) => r.id);
  if (mine.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, mine));
}

/** 더 이상 유효하지 않다고 푸시 서버가 알려 준 주소를 모두 지운다. */
export async function dropEndpoints(db: Db, endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
}

export async function hasSubscription(db: Db, participantId: string, endpoint: string): Promise<boolean> {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.participantId, participantId));
  return rows.some((r) => r.endpoint === endpoint);
}
