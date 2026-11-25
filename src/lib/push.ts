import webpush from "web-push";
import type { Db } from "@/db/client";
import { dropEndpoints, takePending } from "@/domain/notifications";

/**
 * 웹 푸시 설정. VAPID 키 한 쌍이 환경 변수에 있어야 켜진다.
 * 없으면 알림 기능 전체가 꺼지고(화면에서도 숨김) 나머지는 그대로 동작한다.
 */
export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com" };
}

/** 브라우저가 구독할 때 쓰는 공개 키. 알림이 꺼져 있으면 null. */
export function pushPublicKey(): string | null {
  return pushConfig()?.publicKey ?? null;
}

const GONE = new Set([404, 410]);

/**
 * 쌓인 알림을 꺼내 보낸다. 실패해도 다시 보내지 않는다(알림은 놓쳐도 되는 안내다).
 * 푸시 서버가 "없는 주소"라고 답한 구독은 지운다.
 */
export async function flushNotifications(db: Db): Promise<number> {
  const outgoing = await takePending(db);
  const config = pushConfig();
  if (!config || outgoing.length === 0) return 0;

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    outgoing.map(async (o) => {
      try {
        await webpush.sendNotification(
          { endpoint: o.subscription.endpoint, keys: { p256dh: o.subscription.p256dh, auth: o.subscription.auth } },
          JSON.stringify({ title: o.title, body: o.body, url: o.url }),
          {
            vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
            TTL: 60 * 60 * 12,
          },
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status !== undefined && GONE.has(status)) gone.push(o.subscription.endpoint);
        else console.error("[push] 알림을 보내지 못했어요.", status ?? e);
      }
    }),
  );
  await dropEndpoints(db, gone);
  return sent;
}
