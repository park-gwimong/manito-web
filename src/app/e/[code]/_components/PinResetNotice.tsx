"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action";
import { ackPinResetAction } from "../actions";

export function PinResetNotice({ code, resetAtLabel }: { code: string; resetAtLabel: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null>(() => ackPinResetAction(code), null);

  return (
    <div role="status" className="mx-auto w-full max-w-md px-4 pt-4">
      <form action={formAction} className="flex items-center gap-3 rounded-card border-2 border-sun bg-sun-tint px-4 py-3">
        <p className="flex-1 text-sm leading-snug">
          개설자가 PIN을 초기화했어요 ({resetAtLabel})
          {state && !state.ok && <span className="block text-danger">{state.error}</span>}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 shrink-0 rounded-pill bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          확인
        </button>
      </form>
    </div>
  );
}
