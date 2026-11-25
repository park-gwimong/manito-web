"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "../actions";

type State = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const flagKey = (code: string) => `manito_push_${code}`;

function toKeyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * 이 기기에서 이 이벤트의 알림을 켜고 끈다.
 * 미션이 도착했을 때, 내가 챙기는 사람이 기록을 남겼을 때, 마감과 발표 때 알려 준다.
 * `publicKey`가 없으면(서버에 알림 설정이 없으면) 아무것도 그리지 않는다.
 */
export function PushToggle({
  code,
  publicKey,
  hideWhenOn = false,
}: {
  code: string;
  publicKey: string | null;
  /** 홈 화면용: 이미 켰으면 자리를 차지하지 않는다. */
  hideWhenOn?: boolean;
}) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) {
        // 아이폰·아이패드는 홈 화면에 추가한 앱에서만 알림을 받을 수 있다.
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        next = ios ? "needs-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const sub = Notification.permission === "granted" ? await currentSubscription() : null;
        next = sub && window.localStorage.getItem(flagKey(code)) === "1" ? "on" : "off";
        // 브라우저가 구독 정보를 갱신했을 수 있으니, 켜져 있으면 서버에 다시 알려 둔다.
        if (sub && next === "on") void savePushSubscriptionAction(code, sub.toJSON());
      }
      if (!cancelled) setState(next);
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, [code, publicKey]);

  if (!publicKey || state === "checking" || state === "unsupported") return null;
  if (state === "on" && hideWhenOn) return null;

  function turnOn() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const options = { userVisibleOnly: true, applicationServerKey: toKeyBytes(publicKey!) };
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe(options);
        }
        const result = await savePushSubscriptionAction(code, sub.toJSON());
        if (!result.ok) {
          setError(result.error);
          return;
        }
        window.localStorage.setItem(flagKey(code), "1");
        setState("on");
      } catch {
        setError("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      try {
        // 같은 브라우저를 다른 이벤트에서도 쓸 수 있으니, 브라우저 구독은 두고 이 이벤트 연결만 끊는다.
        const sub = await currentSubscription();
        if (sub) await removePushSubscriptionAction(code, sub.endpoint);
        window.localStorage.removeItem(flagKey(code));
        setState("off");
      } catch {
        setError("알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  const message =
    state === "on"
      ? "이 기기로 알림을 받고 있어요."
      : state === "denied"
        ? "브라우저 설정에서 이 사이트의 알림이 막혀 있어요. 허용으로 바꾸면 켤 수 있어요."
        : state === "needs-install"
          ? "아이폰은 공유 버튼에서 '홈 화면에 추가'를 한 뒤, 그 앱에서 알림을 켤 수 있어요."
          : "미션이 도착하거나 내가 챙기는 사람이 기록을 남기면 알려 드릴게요.";

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-card px-5 py-4 shadow-lift sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg text-ink">알림</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {state === "off" && (
        <button
          type="button"
          onClick={turnOn}
          disabled={pending}
          className="min-h-11 shrink-0 rounded-pill bg-ink px-5 text-sm font-semibold text-paper transition active:scale-[0.97] disabled:opacity-50"
        >
          {pending ? "켜는 중…" : "알림 켜기"}
        </button>
      )}
      {state === "on" && (
        <button
          type="button"
          onClick={turnOff}
          disabled={pending}
          className="min-h-11 shrink-0 rounded-pill border border-line px-5 text-sm font-semibold text-ink-soft transition disabled:opacity-50"
        >
          알림 끄기
        </button>
      )}
    </section>
  );
}
