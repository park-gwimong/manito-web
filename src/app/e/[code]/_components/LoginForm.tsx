"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button, ErrorText, Field, PinField } from "../../../_components/ui";
import type { ActionResult } from "@/lib/action";
import type { LoginCandidate } from "@/lib/viewer";
import { loginAction, resetOrganizerPinAction, setNewPinAction } from "../actions";

export function LoginForm({ code, candidates }: { code: string; candidates: LoginCandidate[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData): Promise<ActionResult> => {
      const target = candidates.find((c) => c.id === formData.get("participantId"));
      if (!target) return { ok: false, error: "이름을 골라 주세요." };
      const pin = String(formData.get("pin") ?? "");
      if (!target.needsNewPin) {
        const result = await loginAction(code, target.id, pin);
        // 화면을 연 뒤에 PIN이 초기화됐을 수 있다(PIN_RESET_REQUIRED). 목록을 다시 받아 "새 PIN" 양식으로 바꾼다.
        if (!result.ok) router.refresh();
        return result;
      }
      if (pin !== formData.get("pinConfirm")) {
        return { ok: false, error: "두 PIN이 서로 달라요. 다시 입력해 주세요." };
      }
      const result = await setNewPinAction(code, target.id, pin);
      // 그 사이 다른 기기에서 새 PIN을 정했다면(PIN_NOT_RESET) 일반 로그인 양식으로 돌아가게 한다.
      if (!result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
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
    <OrganizerPinReset code={code} />
    </div>
  );
}

/** 개설자가 PIN을 잊었을 때. 관리 비밀번호로 개설자 PIN을 초기화한다(세션 불필요). */
function OrganizerPinReset({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult | null, formData: FormData) =>
      resetOrganizerPinAction(code, String(formData.get("adminPassword") ?? "")),
    null,
  );

  return (
    <details className="group rounded-field border-2 border-dashed border-line px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-ink-soft">
        개설자 PIN을 잊었어요
      </summary>
      <form action={formAction} className="flex flex-col gap-3 pt-3">
        <Field
          label="관리 비밀번호"
          name="adminPassword"
          type="password"
          autoComplete="off"
          hint="이벤트를 만들 때 쓴 관리 비밀번호예요."
          required
        />
        <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
        {state?.ok && (
          <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium">
            개설자 PIN을 초기화했어요. 개설자 이름을 골라 새 PIN을 정해 주세요.
          </p>
        )}
        <Button type="submit" variant="soft" disabled={pending}>
          {pending ? "확인하는 중…" : "PIN 초기화"}
        </Button>
      </form>
    </details>
  );
}
