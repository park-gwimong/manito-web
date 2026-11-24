"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Card, ErrorText } from "../../../_components/ui";
import { removeParticipantAction, resetPinAction } from "../actions";

type Person = { id: string; name: string; isOrganizer: boolean };

/** 참가자 PIN 초기화(모든 단계)와 내보내기(준비 중에만). 개설자 본인은 대상이 아니다. */
export function ParticipantAdmin({
  code,
  participants,
  canRemove,
}: {
  code: string;
  participants: Person[];
  canRemove: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const others = participants.filter((p) => !p.isOrganizer);

  function run(fn: () => Promise<ActionResult>, done: string) {
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
      <h2 className="font-display text-xl">참가자 관리</h2>
      {others.length === 0 ? (
        <p className="text-sm text-ink-soft">아직 다른 참가자가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {others.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-field bg-paper px-4 py-2">
              <span className="font-medium">{p.name}</span>
              <span className="flex gap-3 text-sm">
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-11 font-semibold text-berry-deep underline underline-offset-4 disabled:opacity-50"
                  aria-label={`${p.name} PIN 초기화`}
                  onClick={() => {
                    if (window.confirm(`${p.name}님의 PIN을 초기화할까요? 다음에 들어올 때 새 PIN을 정해요.`)) {
                      run(() => resetPinAction(code, p.id), `${p.name}님의 PIN을 초기화했어요.`);
                    }
                  }}
                >
                  PIN 초기화
                </button>
                {canRemove && (
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-11 font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
                    aria-label={`${p.name} 내보내기`}
                    onClick={() => {
                      if (window.confirm(`${p.name}님을 내보낼까요?`)) {
                        run(() => removeParticipantAction(code, p.id), `${p.name}님을 내보냈어요.`);
                      }
                    }}
                  >
                    내보내기
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium">
          {notice}
        </p>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
