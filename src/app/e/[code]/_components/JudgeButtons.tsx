"use client";

import { useState, useTransition } from "react";
import { setVerdictAction } from "../actions";

/** `item.judge`가 있을 때만 부모가 그린다. 현재 선택은 서버가 준 값으로 표시한다. */
export function JudgeButtons({
  code,
  recordId,
  myVerdict,
}: {
  code: string;
  recordId: string;
  myVerdict: boolean | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(isMine: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setVerdictAction(code, recordId, isMine);
      if (!result.ok) setError(result.error);
    });
  }

  const options = [
    { value: true, label: "맞아요" },
    { value: false, label: "제가 아니에요" },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-field border border-dashed border-sun bg-sun-tint px-4 py-3">
      <p className="text-sm font-semibold text-ink">이 기록, 내가 몰래 한 일이 맞나요?</p>
      <p className="-mt-1 text-xs text-ink-soft">나에게만 보이는 질문이에요. 답은 발표 때 공개돼요.</p>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            disabled={pending}
            aria-pressed={myVerdict === o.value}
            onClick={() => choose(o.value)}
            className={`min-h-11 flex-1 rounded-pill border px-3 text-sm font-semibold transition disabled:opacity-60 ${
              myVerdict === o.value ? "border-berry bg-berry text-white" : "border-line bg-card text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
