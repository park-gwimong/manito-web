"use client";

import { useActionState } from "react";
import { Button, Card, ErrorText, Field, PinField } from "../../../_components/ui";
import type { ActionResult } from "@/lib/action";
import { joinAction } from "../actions";

export function JoinForm({ code }: { code: string }) {
  // React 19는 action이 끝나면 폼을 초기화하므로, 이름은 상태로 받아 defaultValue로 되살린다(PIN은 비운다).
  const [state, formAction, pending] = useActionState(
    async (_prev: { result: ActionResult; name: string } | null, formData: FormData) => {
      const name = String(formData.get("name") ?? "");
      return { result: await joinAction(code, name, String(formData.get("pin") ?? "")), name };
    },
    null,
  );

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">처음 왔어요</h2>
        <Field
          label="이름"
          name="name"
          placeholder="모두가 알아볼 이름"
          maxLength={20}
          autoComplete="nickname"
          defaultValue={state?.name}
          required
        />
        <PinField name="pin" hint="다른 기기에서 다시 들어올 때 써요. 잊지 않게 기억해 두세요." />
        <ErrorText>{state && !state.result.ok ? state.result.error : null}</ErrorText>
        <Button type="submit" disabled={pending}>
          {pending ? "입장하는 중…" : "입장하기"}
        </Button>
      </form>
    </Card>
  );
}
