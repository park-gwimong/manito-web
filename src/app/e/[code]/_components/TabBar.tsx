"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TabBar({ code, isOrganizer }: { code: string; isOrganizer: boolean }) {
  const pathname = usePathname();
  const base = `/e/${code}`;
  const tabs = [
    { href: base, label: "홈" },
    { href: `${base}/duty`, label: "내 임무" },
    { href: `${base}/rank`, label: "순위" },
    ...(isOrganizer ? [{ href: `${base}/settings`, label: "설정" }] : []),
  ];

  return (
    <nav
      aria-label="이벤트 메뉴"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-sm font-semibold ${
                  active ? "text-berry" : "text-ink-soft"
                }`}
              >
                {tab.label}
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? "bg-sun" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
