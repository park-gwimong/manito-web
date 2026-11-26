"use client";

import { useState, useTransition } from "react";
import type { Duty } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { chooseMissionAction, completeMissionAction } from "../actions";

type Mission = Duty["missions"][number];

export function MissionList({
  code,
  missions,
  readOnly = false,
}: {
  code: string;
  missions: Duty["missions"];
  readOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** 이미 고른 미션을 다른 안으로 바꾸려고 다시 펼친 배달. */
  const [reopened, setReopened] = useState<string | null>(null);

  function complete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await completeMissionAction(code, id);
      if (!result.ok) setError(result.error);
    });
  }

  function choose(id: string, body: string) {
    setError(null);
    startTransition(async () => {
      const result = await chooseMissionAction(code, id, body);
      if (result.ok) setReopened(null);
      else setError(result.error);
    });
  }

  if (missions.length === 0) {
    return <p className="text-sm text-ink-soft">아직 받은 미션이 없어요. 시간이 되면 도착해요.</p>;
  }

  function item(m: Mission) {
    const choosing = !readOnly && !m.completed && m.options !== null && (m.body === null || reopened === m.id);

    if (choosing) {
      return (
        <li key={m.id} className="flex flex-col gap-3 rounded-field border border-line bg-card px-4 py-3 shadow-lift">
          <div className="flex flex-col gap-0.5">
            <span className="text-base text-ink">이 중에서 할 미션을 하나 골라 주세요</span>
            <span className="text-xs text-ink-soft">{formatKst(m.deliveredAt)} 도착</span>
          </div>
          <ul className="flex flex-col gap-2">
            {m.options!.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={option === m.body}
                  onClick={() => choose(m.id, option)}
                  className={`w-full rounded-field border px-4 py-3 text-left text-base text-ink disabled:opacity-60 ${option === m.body ? "border-berry bg-paper" : "border-line bg-card"}`}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
          {m.body !== null && (
            <button type="button" onClick={() => setReopened(null)} className="self-start text-sm text-ink-soft underline">
              그대로 둘게요
            </button>
          )}
        </li>
      );
    }

    if (m.body === null) {
      // 진행이 끝날 때까지 고르지 않은 미션.
      return (
        <li key={m.id} className="flex flex-col gap-0.5 rounded-field bg-paper px-4 py-3">
          <span className="text-base text-ink-soft">고르지 않은 미션이에요</span>
          <span className="text-xs text-ink-soft">{formatKst(m.deliveredAt)} 도착</span>
        </li>
      );
    }

    return (
      <li key={m.id} className={`flex items-start gap-3 rounded-field border px-4 py-3 ${m.completed ? "border-transparent bg-paper" : "border-line bg-card shadow-lift"}`}>
        <input
          type="checkbox"
          id={`mission-${m.id}`}
          checked={m.completed}
          disabled={readOnly || m.completed || pending}
          onChange={() => complete(m.id)}
          className="mt-1 h-6 w-6 shrink-0 accent-berry"
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={`mission-${m.id}`} className={`text-base ${m.completed ? "text-ink-soft line-through" : "text-ink"}`}>
            {m.body}
          </label>
          <span className="text-xs text-ink-soft">
            {formatKst(m.deliveredAt)} 도착{m.completed && " · 완료했어요"}
          </span>
          {!readOnly && !m.completed && m.options !== null && (
            <button type="button" onClick={() => setReopened(m.id)} className="self-start text-sm text-ink-soft underline">
              다른 미션으로 바꾸기
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">{missions.map(item)}</ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
