import type { FeedItem } from "@/domain/views";
import { FeedCard } from "./FeedCard";

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
      <p className="rounded-card border-2 border-dashed border-line px-5 py-8 text-center text-ink-soft">{emptyText}</p>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <FeedCard code={code} item={item} readOnly={readOnly} />
        </li>
      ))}
    </ul>
  );
}
