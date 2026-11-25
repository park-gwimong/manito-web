"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const STYLE =
  "-ml-2 flex min-h-11 items-center gap-1 self-start rounded-field px-2 text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink";

/**
 * 설명서를 보다가 원래 있던 화면으로 돌아간다.
 * 앱 안에서 넘어왔으면 한 걸음 뒤로, 주소로 바로 들어왔으면 첫 화면으로 간다.
 */
export function GuideBack() {
  const router = useRouter();
  return (
    <Link
      href="/"
      className={STYLE}
      onClick={(e) => {
        const cameFromApp = document.referrer.startsWith(window.location.origin) || window.history.length > 1;
        if (!cameFromApp) return;
        e.preventDefault();
        router.back();
      }}
    >
      <span aria-hidden="true">←</span>
      돌아가기
    </Link>
  );
}
