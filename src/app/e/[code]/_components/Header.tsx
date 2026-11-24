import { MAX_TEMP } from "@/domain/constants";
import { ddayLabel, formatTemp } from "@/lib/format";

/** 모임 온도 게이지와 D-day. 상태가 없어 서버에서 그린다. */
export function Header({
  eventName,
  temperature,
  dday,
}: {
  eventName: string;
  temperature: number;
  dday: number | null;
}) {
  const percent = Math.min(100, Math.max(0, (temperature / MAX_TEMP) * 100));
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl leading-tight text-ink">{eventName}</h1>
        {dday !== null && (
          <span className="shrink-0 rounded-pill bg-sun px-3 py-1 font-display text-lg text-ink">{ddayLabel(dday)}</span>
        )}
      </div>
      <div className="rounded-card border-2 border-line bg-card px-5 py-4 shadow-lift">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink-soft">모임 온도</span>
          <span className="font-display text-3xl text-berry">{formatTemp(temperature)}</span>
        </div>
        <div
          role="meter"
          aria-label="모임 온도"
          aria-valuemin={0}
          aria-valuemax={MAX_TEMP}
          aria-valuenow={Math.round(temperature * 10) / 10}
          className="mt-3 h-3 overflow-hidden rounded-pill bg-paper-deep"
        >
          <div className="h-full rounded-pill bg-berry" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </header>
  );
}
