"use client";

import { useState, useTransition } from "react";
import { Button, Card, ErrorText } from "../../../_components/ui";
import { setGuessAction } from "../actions";

type Props = {
  code: string;
  candidates: { id: string; name: string }[];
  initialGuessId: string | null;
  locked: boolean;
};

/** 마감 후 내 마니또 추측. 나를 뺀 명단에서 고르고, 발표가 시작되면 잠긴다. */
export function GuessForm({ code, candidates, initialGuessId, locked }: Props) {
  const [selected, setSelected] = useState<string | null>(initialGuessId);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(initialGuessId !== null);
  const [pending, startTransition] = useTransition();
  const savedName = candidates.find((c) => c.id === initialGuessId)?.name;

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await setGuessAction(code, selected);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-xl">내 마니또는 누구일까요?</h2>
      {locked ? (
        <p className="leading-relaxed text-ink-soft">
          발표가 시작돼서 추측이 잠겼어요.
          {savedName ? ` 내 추측은 ${savedName}님이에요.` : " 이번에는 추측하지 않았어요."}
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">
            발표가 시작되기 전까지 몇 번이든 바꿀 수 있어요. 맞히면 보너스 점수가 있어요.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">나를 뺀 참가자</legend>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <label
                  key={c.id}
                  className="flex min-h-11 cursor-pointer items-center rounded-pill border border-line bg-card px-4 font-medium has-checked:border-berry has-checked:bg-berry has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-sun"
                >
                  <input
                    type="radio"
                    name="guess"
                    value={c.id}
                    checked={selected === c.id}
                    onChange={() => {
                      setSelected(c.id);
                      setSaved(false);
                    }}
                    className="sr-only"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
          <ErrorText>{error}</ErrorText>
          {saved && !error && (
            <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium">
              추측을 저장했어요.
            </p>
          )}
          <Button type="button" onClick={submit} disabled={!selected || pending}>
            {pending ? "저장하는 중…" : "이 사람으로 정하기"}
          </Button>
        </>
      )}
    </Card>
  );
}
