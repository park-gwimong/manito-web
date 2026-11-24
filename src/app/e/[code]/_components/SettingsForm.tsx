"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Button, Card, ErrorText, Field } from "../../../_components/ui";
import { startPresentationAction, updateSettingsAction } from "../actions";

type Props = {
  code: string;
  name: string;
  startsAtInput: string;
  endsAtInput: string;
  missionCount: number;
  templateCount: number;
};

/** 준비 중에만 보이는 이벤트 정보 수정. 시간은 모두 한국 시간이다. */
export function SettingsForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult | null, formData: FormData) => updateSettingsAction(props.code, formData),
    null,
  );

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-xl">이벤트 정보</h2>
        <Field label="이벤트 이름" name="name" defaultValue={props.name} maxLength={40} required />
        <Field label="시작 일시" name="startsAt" type="datetime-local" defaultValue={props.startsAtInput} required />
        <Field
          label="종료 일시"
          name="endsAt"
          type="datetime-local"
          defaultValue={props.endsAtInput}
          hint="한국 시간 기준이에요."
          required
        />
        <Field
          label="미션 개수"
          name="missionCount"
          type="number"
          inputMode="numeric"
          min={0}
          max={props.templateCount}
          defaultValue={props.missionCount}
          hint={`미션 목록에 ${props.templateCount}개가 있어요. 그 안에서 정해 주세요.`}
          required
        />
        <ErrorText>{state && !state.ok ? state.error : null}</ErrorText>
        {state?.ok && (
          <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium">
            저장했어요.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "저장하는 중…" : "저장하기"}
        </Button>
      </Card>
    </form>
  );
}

/** 마감 후 "결과 발표 시작". 시작하면 추측이 잠기므로 한 번 더 확인한다. */
export function PresentationStart({
  code,
  started,
  unguessed,
}: {
  code: string;
  started: boolean;
  /** 아직 추측하지 않은 사람 수(이름은 받지 않는다). */
  unguessed: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    const notice = unguessed > 0 ? `아직 ${unguessed}명이 추측하지 않았어요. ` : "";
    if (!started && !window.confirm(`${notice}발표를 시작하면 더 이상 마니또를 추측할 수 없어요. 시작할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const result: ActionResult = started ? { ok: true } : await startPresentationAction(code);
      if (result.ok) router.push(`/e/${code}/present`);
      else setError(result.error);
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-xl">결과 발표</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        {started
          ? "발표가 시작됐어요. 큰 화면에 이어서 띄워 주세요."
          : "큰 화면(TV나 빔프로젝터)에 연결한 기기에서 시작해 주세요."}
      </p>
      {!started && (
        <>
          <p role="status" className="rounded-field bg-paper px-4 py-3 text-sm font-medium">
            {unguessed > 0 ? `아직 추측하지 않은 사람: ${unguessed}명` : "모두 추측을 마쳤어요"}
          </p>
          <p className="rounded-field bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
            발표를 시작하면 추측이 잠기고, 다시 열 수 없어요.
          </p>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="button" onClick={start} disabled={pending}>
        {pending ? "여는 중…" : started ? "발표 화면 열기" : "결과 발표 시작"}
      </Button>
    </Card>
  );
}
