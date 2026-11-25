"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Card, ErrorText } from "../../../_components/ui";
import { removeParticipantAction, resetPinAction } from "../actions";

type Person = { id: string; name: string; isOrganizer: boolean };

/**
 * 참가자 PIN 초기화(모든 단계)와 내보내기(준비 중, 진행 중). 개설자 본인은 대상이 아니다.
 * 진행 중에 내보내면 그 사람의 기록이 지워지고 배정이 이어 붙으므로 더 무겁게 확인한다.
 */
export function ParticipantAdmin({
  code,
  participants,
  canRemove,
  midEvent = false,
}: {
  code: string;
  participants: Person[];
  canRemove: boolean;
  /** 진행 중인지. 내보내기의 안내와 확인 문구가 달라진다. */
  midEvent?: boolean;
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
                      const question = midEvent
                        ? `${p.name}님을 내보낼까요?

${p.name}님이 쓴 기록과 받은 미션이 지워지고, ${p.name}님을 챙기던 마니또는 다른 사람을 챙기게 돼요. 되돌릴 수 없어요.`
                        : `${p.name}님을 내보낼까요?`;
                      if (window.confirm(question)) {
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
      {midEvent && canRemove && others.length > 0 && (
        <p className="text-sm leading-relaxed text-ink-soft">
          더 이상 참여하지 못하는 사람은 내보낼 수 있어요. 그 사람을 챙기던 마니또가 그 사람의 대상을 이어받아, 아무도
          빠지지 않게 돼요. 누가 누구를 이어받는지는 개설자에게도 보이지 않아요.
        </p>
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
