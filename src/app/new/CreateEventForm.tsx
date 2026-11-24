"use client";

import { useActionState } from "react";
import { Button, Card, ErrorText, Field, PinField } from "../_components/ui";
import type { ActionResult } from "@/lib/action";
import { createEventAction } from "./actions";

export function CreateEventForm() {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult | null, formData: FormData) => createEventAction(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">이벤트</h2>
        <Field label="이벤트 이름" name="name" placeholder="예: 우리 팀 연말 마니또" maxLength={40} required />
        <Field label="시작 일시" name="startsAt" type="datetime-local" required />
        <Field label="종료 일시" name="endsAt" type="datetime-local" hint="한국 시간 기준이에요." required />
        <Field
          label="미션 개수"
          name="missionCount"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={5}
          hint="기간 동안 한 사람에게 나눠서 보내는 미션 수예요."
          required
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">나</h2>
        <Field label="내 이름" name="organizerName" placeholder="모두가 알아볼 이름" maxLength={20} required />
        <PinField name="organizerPin" hint="다른 기기에서 다시 들어올 때 써요." />
      </Card>

      <Card className="flex flex-col gap-4">
        <Field
          label="관리 비밀번호"
          name="adminPassword"
          type="password"
          autoComplete="off"
          hint="서비스를 운영하는 사람에게 받은 비밀번호예요."
          required
        />
      </Card>

      <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
      <Button type="submit" disabled={pending} className="sticky bottom-4">
        {pending ? "만드는 중…" : "이벤트 만들기"}
      </Button>
    </form>
  );
}
