"use client";

import { useActionState } from "react";
import { Button, Card, ErrorText, Field, PinField } from "../../../_components/ui";
import type { ActionResult } from "@/lib/action";
import { joinAction } from "../actions";

export function JoinForm({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult | null, formData: FormData) =>
      joinAction(code, String(formData.get("name") ?? ""), String(formData.get("pin") ?? "")),
    null,
  );

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">처음 왔어요</h2>
        <Field label="이름" name="name" placeholder="모두가 알아볼 이름" maxLength={20} autoComplete="nickname" required />
        <PinField name="pin" hint="다른 기기에서 다시 들어올 때 써요. 잊지 않게 기억해 두세요." />
        <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "입장하는 중…" : "입장하기"}
        </Button>
      </form>
    </Card>
  );
}
