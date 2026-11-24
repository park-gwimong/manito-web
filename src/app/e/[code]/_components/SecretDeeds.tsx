"use client";

import { useState, useTransition } from "react";
import { BODY_MAX } from "@/domain/constants";
import type { Duty } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { Button, ErrorText } from "../../../_components/ui";
import { addSecretDeedAction, deleteSecretDeedAction } from "../actions";

export function SecretDeeds({
  code,
  deeds,
  readOnly = false,
}: {
  code: string;
  deeds: Duty["secretDeeds"];
  readOnly?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addSecretDeedAction(code, body);
      if (result.ok) setBody("");
      else setError(result.error);
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteSecretDeedAction(code, id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
      <form onSubmit={add} className="flex flex-col gap-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={2}
          aria-label="몰래 한 일"
          placeholder="상대가 모르게 챙겨 준 일을 적어 두세요"
          className="rounded-field border-2 border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-berry focus:outline-none"
        />
        <Button type="submit" variant="soft" disabled={pending || body.trim() === ""}>
          메모 남기기
        </Button>
      </form>
      )}
      <ErrorText>{error}</ErrorText>
      {deeds.length > 0 && (
        <ul className="flex flex-col gap-2">
          {deeds.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-field bg-paper px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="whitespace-pre-wrap text-base text-ink">{d.body}</span>
                <span className="text-xs text-ink-soft">{formatKst(d.createdAt)}</span>
              </div>
              {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(d.id)}
                className="shrink-0 text-sm font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
              >
                삭제
              </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
