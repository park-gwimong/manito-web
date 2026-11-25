"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Button, Card, ErrorText, Field } from "../../../_components/ui";
import { changeEndsAtAction, closeNowAction, startNowAction } from "../actions";

/** 준비 중: 시작 시각을 기다리지 않고 바로 시작한다. 인원이 모자라면 누를 수 없다. */
export function StartNowButton({ code, count, min }: { code: string; count: number; min: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const short = count < min;

  function start() {
    if (!window.confirm("지금 시작하면 마니또가 바로 정해지고, 더 이상 새로 참가할 수 없어요. 시작할까요?")) return;
    setError(null);
    startTransition(async () => {
      const result = await startNowAction(code);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={start} disabled={pending || short}>
        {pending ? "시작하는 중…" : "지금 시작하기"}
      </Button>
      <p className="text-sm text-ink-soft">
        {short
          ? `${min}명이 모이면 시작 시각 전에도 바로 시작할 수 있어요.`
          : "모두 모였다면 시작 시각을 기다리지 않고 바로 시작할 수 있어요."}
      </p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** 진행 중: 종료 일시를 늦추거나 당기고, 필요하면 지금 마감한다. */
export function ActiveControls({ code, endsAtInput }: { code: string; endsAtInput: string }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState(endsAtInput);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, done: string | null) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) setNotice(done);
      else setError(result.error);
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl">일정</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => changeEndsAtAction(code, endsAt), "종료 일시를 바꿨어요.");
        }}
      >
        <Field
          label="종료 일시"
          name="endsAt"
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          hint="한국 시간 기준이에요. 이미 보낸 미션은 그대로 두고, 남은 미션만 새 기간에 맞춰 도착해요."
          required
        />
        <Button type="submit" variant="soft" disabled={pending || endsAt === endsAtInput}>
          종료 일시 바꾸기
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          지금 마감하면 기록과 미션이 닫히고 마니또 맞히기가 열려요. 남은 미션은 보내지 않고, 되돌릴 수 없어요.
        </p>
        <button
          type="button"
          disabled={pending}
          className="min-h-12 self-start rounded-pill border border-danger px-6 font-semibold text-danger transition hover:bg-danger-tint disabled:opacity-50"
          onClick={() => {
            if (window.confirm("지금 마감할까요? 기록과 미션이 닫히고 되돌릴 수 없어요.")) {
              run(() => closeNowAction(code), null);
            }
          }}
        >
          지금 마감하기
        </button>
      </div>

      {notice && (
        <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium">
          {notice}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
