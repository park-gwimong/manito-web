"use client";

import { useActionState, useState, type FormEvent } from "react";
import { scheduleProblems } from "@/lib/schedule-check";
import { Button, Card, ErrorText, Field, PinField, ProblemList } from "../_components/ui";
import type { ActionResult } from "@/lib/action";
import { createEventAction } from "./actions";

/** 실패해도 다시 채워 둘 값. PIN과 관리 비밀번호는 되돌려 보여 주지 않는다. */
type Kept = { name: string; startsAt: string; endsAt: string; missionCount: string; organizerName: string };
const KEPT_FIELDS = ["name", "startsAt", "endsAt", "missionCount", "organizerName"] as const;

export function CreateEventForm({
  defaultStartsAt,
  defaultEndsAt,
  maxMissions,
}: {
  /** 처음 열었을 때 채워 둘 일정(KST 입력값). */
  defaultStartsAt: string;
  defaultEndsAt: string;
  maxMissions: number;
}) {
  const [problems, setProblems] = useState<string[]>([]);

  /** 보내기 전에 일정에서 고칠 곳을 모두 모아 한 번에 보여 준다. */
  function check(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const found = scheduleProblems(
      {
        startsAt: String(data.get("startsAt") ?? ""),
        endsAt: String(data.get("endsAt") ?? ""),
        missionCount: String(data.get("missionCount") ?? ""),
      },
      maxMissions,
      new Date(),
    );
    setProblems(found);
    if (found.length > 0) e.preventDefault();
  }

  // React 19는 action이 끝나면 폼을 초기화하므로, 보낸 값을 상태로 받아 defaultValue로 되살린다.
  const [state, formAction, pending] = useActionState(
    async (_prev: { result: ActionResult; kept: Kept } | null, formData: FormData) => {
      const kept = Object.fromEntries(KEPT_FIELDS.map((k) => [k, String(formData.get(k) ?? "")])) as Kept;
      return { result: await createEventAction(formData), kept };
    },
    null,
  );
  const kept = state?.kept;

  return (
    <form action={formAction} onSubmit={check} className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">이벤트</h2>
        <Field
          label="이벤트 이름"
          name="name"
          placeholder="예: 우리 팀 연말 마니또"
          maxLength={40}
          defaultValue={kept?.name}
          required
        />
        <Field label="시작 일시" name="startsAt" type="datetime-local" defaultValue={kept?.startsAt ?? defaultStartsAt} required />
        <Field
          label="종료 일시"
          name="endsAt"
          type="datetime-local"
          hint="한국 시간 기준이에요."
          defaultValue={kept?.endsAt ?? defaultEndsAt}
          required
        />
        <Field
          label="미션 개수"
          name="missionCount"
          type="number"
          inputMode="numeric"
          min={0}
          max={maxMissions}
          defaultValue={kept?.missionCount ?? 5}
          hint={`기간 동안 한 사람에게 나눠서 보내는 미션 수예요. 0개부터 ${maxMissions}개까지 정할 수 있어요.`}
          required
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">나</h2>
        <Field
          label="내 이름"
          name="organizerName"
          placeholder="모두가 알아볼 이름"
          maxLength={20}
          defaultValue={kept?.organizerName}
          required
        />
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

      <ProblemList problems={problems} />
      <ErrorText>{problems.length === 0 && state && !state.result.ok ? state.result.error : null}</ErrorText>
      <Button type="submit" disabled={pending} className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))]">
        {pending ? "만드는 중…" : "이벤트 만들기"}
      </Button>
    </form>
  );
}
