"use client";

import { useState, useTransition } from "react";
import type { Duty } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { completeMissionAction } from "../actions";

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

  function complete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await completeMissionAction(code, id);
      if (!result.ok) setError(result.error);
    });
  }

  if (missions.length === 0) {
    return <p className="text-sm text-ink-soft">아직 받은 미션이 없어요. 시간이 되면 도착해요.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {missions.map((m) => (
          <li key={m.id} className={`flex items-start gap-3 rounded-field border px-4 py-3 ${m.completed ? "border-transparent bg-paper" : "border-line bg-card shadow-lift"}`}>
            <input
              type="checkbox"
              id={`mission-${m.id}`}
              checked={m.completed}
              disabled={readOnly || m.completed || pending}
              onChange={() => complete(m.id)}
              className="mt-1 h-6 w-6 shrink-0 accent-berry"
            />
            <label htmlFor={`mission-${m.id}`} className="flex flex-col gap-0.5">
              <span className={`text-base ${m.completed ? "text-ink-soft line-through" : "text-ink"}`}>{m.body}</span>
              <span className="text-xs text-ink-soft">
                {formatKst(m.deliveredAt)} 도착{m.completed && " · 완료했어요"}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
