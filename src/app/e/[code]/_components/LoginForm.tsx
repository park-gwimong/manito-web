"use client";

import { useActionState, useState } from "react";
import { Button, ErrorText, PinField } from "../../../_components/ui";
import type { ActionResult } from "@/lib/action";
import type { LoginCandidate } from "@/lib/viewer";
import { loginAction, setNewPinAction } from "../actions";

export function LoginForm({ code, candidates }: { code: string; candidates: LoginCandidate[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData): Promise<ActionResult> => {
      const target = candidates.find((c) => c.id === formData.get("participantId"));
      if (!target) return { ok: false, error: "이름을 골라 주세요." };
      const pin = String(formData.get("pin") ?? "");
      if (!target.needsNewPin) return loginAction(code, target.id, pin);
      if (pin !== formData.get("pinConfirm")) {
        return { ok: false, error: "두 PIN이 서로 달라요. 다시 입력해 주세요." };
      }
      return setNewPinAction(code, target.id, pin);
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">내 이름을 골라 주세요</legend>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <label
              key={c.id}
              className="flex min-h-11 cursor-pointer items-center rounded-pill border-2 border-line bg-card px-4 font-medium has-checked:border-berry has-checked:bg-berry has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-sun"
            >
              <input
                type="radio"
                name="participantId"
                value={c.id}
                checked={selectedId === c.id}
                onChange={() => setSelectedId(c.id)}
                className="sr-only"
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      {selected && (
        <div key={selected.id} className="flex flex-col gap-4">
          {selected.needsNewPin ? (
            <>
              <p className="rounded-field bg-sun-tint px-4 py-3 text-sm leading-relaxed">
                개설자가 PIN을 초기화했어요. 새로 쓸 PIN을 정해 주세요.
              </p>
              <PinField name="pin" label="새 PIN (숫자 4자리)" autoFocus />
              <PinField name="pinConfirm" label="새 PIN 한 번 더" />
            </>
          ) : (
            <PinField name="pin" autoFocus />
          )}
          <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
          <Button type="submit" disabled={pending}>
            {pending ? "확인하는 중…" : selected.needsNewPin ? "새 PIN으로 들어가기" : "들어가기"}
          </Button>
        </div>
      )}
    </form>
  );
}
