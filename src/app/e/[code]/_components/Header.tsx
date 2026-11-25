import Link from "next/link";
import { BASE_TEMP } from "@/domain/constants";
import { ddayLabel, formatTemp } from "@/lib/format";
import { Thermometer } from "./Thermometer";

/** 휴대폰 화면 맨 위의 이벤트 이름, D-day, 모임 온도계. 넓은 화면에서는 왼쪽 레일(EventShell)이 대신한다. */
export function Header({
  eventName,
  temperature,
  dday,
}: {
  eventName: string;
  temperature: number;
  dday: number | null;
}) {
  return (
    <header className="flex flex-col gap-3 lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl leading-tight text-ink">{eventName}</h1>
        {dday !== null && <DdaySticker dday={dday} />}
      </div>
      <div className="rounded-card border border-line bg-card px-5 py-5 shadow-lift">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-ink-soft">모임 온도</span>
          <span className="font-display text-5xl leading-none text-berry">{formatTemp(temperature)}</span>
        </div>
        <Thermometer temperature={temperature} />
        <p className="mt-2 text-xs text-ink-soft">
          {formatTemp(BASE_TEMP)}에서 시작해 기록, 반응, 미션 완료처럼 모두가 한 일만큼 올라가요.
        </p>
      </div>
      <Link
        href="/guide"
        className="-my-1 flex min-h-11 items-center self-end text-sm font-semibold text-ink-soft underline underline-offset-4"
      >
        사용 설명서
      </Link>
    </header>
  );
}

/** 살짝 기울여 붙인 노란 스티커. */
export function DdaySticker({ dday }: { dday: number }) {
  return (
    <span className="shrink-0 rounded-pill bg-sun px-3.5 py-1 font-display text-base text-sun-ink">
      {ddayLabel(dday)}
    </span>
  );
}
