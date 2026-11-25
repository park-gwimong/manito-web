import { BASE_TEMP, MAX_TEMP } from "@/domain/constants";
import { formatTemp } from "@/lib/format";

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * 모임 온도계. 이 서비스의 얼굴이라 숫자 막대가 아니라 진짜 온도계처럼 그린다.
 * 36.5℃(시작 체온)에 눈금을 두어 지금까지 얼마나 올랐는지 보이게 한다.
 * 상태가 없어 서버·클라이언트 어디서든 그릴 수 있다.
 */
export function Thermometer({
  temperature,
  orientation = "horizontal",
}: {
  temperature: number;
  orientation?: "horizontal" | "vertical";
}) {
  const percent = clamp((temperature / MAX_TEMP) * 100);
  const basePercent = clamp((BASE_TEMP / MAX_TEMP) * 100);
  const meter = {
    role: "meter",
    "aria-label": "모임 온도",
    "aria-valuemin": 0,
    "aria-valuemax": MAX_TEMP,
    "aria-valuenow": Math.round(temperature * 10) / 10,
    "aria-valuetext": formatTemp(temperature),
  } as const;

  if (orientation === "vertical") {
    return (
      <div className="flex items-end gap-4">
        <div {...meter} className="relative flex flex-col items-center">
          <div className="relative h-44 w-5 overflow-hidden rounded-t-pill border border-b-0 border-berry-deep/25 bg-card">
            <div className="mercury-v absolute inset-x-0 bottom-0 bg-berry" style={{ height: `${percent}%` }} />
          </div>
          {/* 구부 */}
          <div className="-mt-1.5 h-11 w-11 rounded-full border border-berry-deep/25 bg-berry shadow-[inset_-4px_-4px_0_0_rgb(0_0_0/0.18)]" />
          {/* 시작 체온 눈금 */}
          <div
            aria-hidden="true"
            className="absolute left-full ml-1.5 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-xs text-ink-soft"
            style={{ top: `calc(${100 - basePercent}% * 0.8)` }}
          >
            <span className="h-0.5 w-2.5 bg-ink-soft/50" />
            {formatTemp(BASE_TEMP)}에서 시작
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...meter} className="relative flex items-center">
      {/* 구부 */}
      <div className="z-10 h-7 w-7 shrink-0 rounded-full bg-berry shadow-[inset_-3px_-3px_0_0_rgb(0_0_0/0.18)]" />
      <div className="relative -ml-2 h-3.5 flex-1 overflow-hidden rounded-r-pill border border-l-0 border-berry-deep/25 bg-card">
        <div className="mercury-h absolute inset-y-0 left-0 bg-berry" style={{ width: `${percent}%` }} />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-ink/25"
          style={{ left: `${basePercent}%` }}
          title={`${formatTemp(BASE_TEMP)}에서 시작`}
        />
      </div>
    </div>
  );
}
