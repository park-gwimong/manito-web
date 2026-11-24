"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DEFAULT_INTERVAL_MS = 20_000;

/** 일정 간격(기본 20초)마다 서버 데이터를 다시 받는다. 탭이 보이지 않는 동안은 멈추고, 다시 보이면 바로 한 번 갱신한다. */
export function AutoRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
