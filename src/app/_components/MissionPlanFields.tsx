"use client";

import { useEffect, useRef, useState } from "react";
import { plannedMissionCount, type MissionMode } from "@/domain/mission-plan";
import { parseKstInput } from "@/lib/format";
import { Field } from "./ui";

const MODES: { value: MissionMode; label: string; desc: string }[] = [
  { value: "daily", label: "매일 1개", desc: "시작할 때 하나, 그 뒤로 매일 하나씩 도착해요. 올 때마다 3개 중 하나를 골라서 해요." },
  { value: "alternate", label: "이틀에 1개", desc: "시작할 때 하나, 그 뒤로 이틀에 하나씩 도착해요." },
  { value: "custom", label: "개수 직접 정하기", desc: "정한 개수를 기간에 고르게 나눠 보내요." },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  if (h === 0) return "밤 12시";
  if (h === 12) return "낮 12시";
  return h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`;
}

/**
 * 미션을 보내는 방식 고르기. 이벤트 만들기와 설정 화면이 함께 쓴다.
 * 같은 폼의 시작·종료 일시를 읽어, 이 일정이면 미션이 몇 개 도착하는지 바로 보여 준다.
 */
export function MissionPlanFields({
  defaultMode,
  defaultHour,
  defaultCount,
  maxMissions,
}: {
  defaultMode: MissionMode;
  defaultHour: number;
  defaultCount: number | string;
  /** 미션 목록에 있는 개수. 직접 정할 때의 상한이다. */
  maxMissions: number;
}) {
  const [mode, setMode] = useState<MissionMode>(defaultMode);
  const [hour, setHour] = useState(defaultHour);
  const [planned, setPlanned] = useState<number | null>(null);
  const root = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const update = () => {
      const data = new FormData(form);
      const startsAt = parseKstInput(String(data.get("startsAt") ?? ""));
      const endsAt = parseKstInput(String(data.get("endsAt") ?? ""));
      if (mode === "custom" || !startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
        setPlanned(null);
        return;
      }
      setPlanned(plannedMissionCount({ startsAt, endsAt, missionMode: mode, missionHour: hour, missionCount: 0 }));
    };
    update();
    form.addEventListener("input", update);
    return () => form.removeEventListener("input", update);
  }, [mode, hour]);

  return (
    <fieldset ref={root} className="flex flex-col gap-3">
      <legend className="mb-1.5 text-sm font-semibold text-ink">미션 보내기</legend>
      <div className="flex flex-col gap-2">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex min-h-13 cursor-pointer items-start gap-3 rounded-field border px-4 py-3 transition ${
              mode === m.value ? "border-berry bg-berry-tint" : "border-line bg-card"
            }`}
          >
            <input
              type="radio"
              name="missionMode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-berry"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink">{m.label}</span>
              <span className="text-xs leading-relaxed text-ink-soft">{m.desc}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "custom" ? (
        <Field
          label="미션 개수"
          name="missionCount"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxMissions}
          defaultValue={defaultCount}
          hint={`한 사람에게 보내는 미션 수예요. 0개부터 ${maxMissions}개까지 정할 수 있어요. 0으로 하면 미션 없이 진행해요.`}
          required
        />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink">도착 시각</span>
          <select
            name="missionHour"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="min-h-13 rounded-field border border-line bg-card px-4 text-base text-ink transition focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <span className="text-xs leading-relaxed text-ink-soft">
            한국 시간 기준이에요. 첫 미션은 시작 일시에 바로 도착하고, 다음 날부터 이 시각에 와요.
          </span>
        </label>
      )}

      {planned !== null && (
        <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm leading-relaxed text-ink">
          이 일정이면 한 사람이 미션 <strong>{planned}개</strong>를 받아요.
          {planned > maxMissions && ` 미션 목록(${maxMissions}개)보다 많아서, 다 받은 뒤에는 받았던 미션이 다시 올 수 있어요.`}
        </p>
      )}
    </fieldset>
  );
}
