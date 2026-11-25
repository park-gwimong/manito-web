"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { formatTemp } from "@/lib/format";
import { DdaySticker } from "./Header";
import { Thermometer } from "./Thermometer";

type Tab = { href: string; label: string; icon: ReactNode; badge?: number };

/** 메뉴 아이콘 옆에 붙는 숫자. 스크린리더에는 링크의 aria-label로 읽힌다. */
function Badge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1 text-[0.6875rem] leading-none font-bold text-sun-ink"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

const ICON = "h-6 w-6 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]";

function tabsFor(code: string, isOrganizer: boolean, dutyBadge: number): Tab[] {
  const base = `/e/${code}`;
  return [
    {
      href: base,
      label: "홈",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5V20H4z" />
          <path d="M10 20v-5h4v5" />
        </svg>
      ),
    },
    {
      href: `${base}/duty`,
      label: "내 임무",
      badge: dutyBadge,
      icon: (
        <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="m3.5 7.5 8.5 6 8.5-6" />
        </svg>
      ),
    },
    {
      href: `${base}/rank`,
      label: "순위",
      icon: (
        <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
          <path d="M9 20V9h6v11M3 20v-7h6M15 20v-5h6v5M2 20h20" />
        </svg>
      ),
    },
    ...(isOrganizer
      ? [
          {
            href: `${base}/settings`,
            label: "설정",
            icon: (
              <svg viewBox="0 0 24 24" className={ICON} aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="8" cy="17" r="2" />
              </svg>
            ),
          },
        ]
      : []),
  ];
}

/**
 * 진행 중인 이벤트의 화면 틀.
 * - 휴대폰: 본문 + 아래 고정 탭.
 * - 넓은 화면: 왼쪽에 이벤트 이름, 세로 온도계, 메뉴가 붙어 있는 레일 + 오른쪽 본문.
 * 발표 화면은 큰 화면 전체를 쓰므로 틀을 씌우지 않는다.
 */
export function EventShell({
  code,
  eventName,
  myName,
  isOrganizer,
  temperature,
  dday,
  dutyBadge = 0,
  children,
}: {
  code: string;
  eventName: string;
  myName: string;
  isOrganizer: boolean;
  temperature: number;
  dday: number | null;
  /** 내 임무에 남은 일(완료하지 않은 미션 + 답하지 않은 기록). */
  dutyBadge?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === `/e/${code}/present`) return <>{children}</>;
  const tabs = tabsFor(code, isOrganizer, dutyBadge);
  const labelOf = (tab: Tab) => (tab.badge ? `${tab.label}, 할 일 ${tab.badge}개` : undefined);

  return (
    <div className="flex flex-1 flex-col lg:mx-auto lg:grid lg:w-full lg:max-w-5xl lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-6">
      <aside className="glass sticky top-6 my-6 hidden h-[calc(100dvh-3rem)] flex-col gap-5 rounded-card border border-line p-5 shadow-lift lg:flex">
        <div className="flex flex-col items-start gap-3 px-1 pt-1">
          {dday !== null && <DdaySticker dday={dday} />}
          <h1 className="font-display text-2xl leading-tight text-ink">{eventName}</h1>
        </div>

        <div className="flex flex-col gap-4 rounded-[1.25rem] bg-paper p-4">
          <div>
            <p className="text-sm font-semibold text-ink-soft">모임 온도</p>
            <p className="font-display text-5xl leading-none text-berry">{formatTemp(temperature)}</p>
          </div>
          <Thermometer temperature={temperature} orientation="vertical" />
        </div>

        <nav aria-label="이벤트 메뉴">
          <ul className="flex flex-col gap-1">
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={labelOf(tab)}
                    className={`flex min-h-12 items-center gap-3 rounded-field px-4 text-base font-semibold transition-colors ${
                      active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.badge ? (
                      <span className="ml-auto">
                        <Badge count={tab.badge} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <p className="mt-auto px-1 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{myName}</span>님으로 들어와 있어요
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      {/* 휴대폰: 화면 아래에 떠 있는 알약 모양 메뉴 */}
      <nav
        aria-label="이벤트 메뉴"
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-sm rounded-pill border border-line p-1.5 shadow-lift lg:hidden"
      >
        <ul className="flex gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={labelOf(tab)}
                  className={`relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-pill text-[0.6875rem] font-semibold transition-colors ${
                    active ? "bg-ink text-paper" : "text-ink-soft"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge ? (
                    <span className="absolute top-1 left-1/2 ml-2">
                      <Badge count={tab.badge} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
