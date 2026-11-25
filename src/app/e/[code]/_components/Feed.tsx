import type { FeedItem } from "@/domain/views";
import { formatKstDay, kstDayKey } from "@/lib/format";
import { FeedCard } from "./FeedCard";

/** 기록 목록. 같은 날 올라온 글끼리 날짜 구분선 아래에 묶는다. */
export function Feed({
  code,
  items,
  readOnly = false,
  emptyText = "아직 기록이 없어요. 첫 기록을 남겨 보세요.",
}: {
  code: string;
  items: FeedItem[];
  readOnly?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-ink-soft">{emptyText}</p>
    );
  }

  const now = new Date();
  const days: { key: string; label: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const key = kstDayKey(item.createdAt);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: formatKstDay(item.createdAt, now), items: [item] });
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.key} aria-label={day.label} className="flex flex-col gap-3">
          <h3 className="flex items-center gap-3 text-sm font-semibold text-ink-soft">
            {day.label}
            <span aria-hidden="true" className="h-0.5 flex-1 rounded-pill bg-line" />
          </h3>
          <ul className="flex flex-col gap-3">
            {day.items.map((item) => (
              <li key={item.id}>
                <FeedCard code={code} item={item} readOnly={readOnly} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
