"use client";

import { useState, useTransition } from "react";
import { BODY_MAX } from "@/domain/constants";
import { Button, ErrorText } from "../../../_components/ui";
import { createRecordAction } from "../actions";

export function RecordForm({ code }: { code: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRecordAction(code, body);
      if (result.ok) setBody("");
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border-2 border-line bg-card p-4 shadow-lift">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">오늘 모임 기록</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={3}
          placeholder="오늘 있었던 일을 남겨 보세요"
          className="rounded-field border-2 border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-soft/60 focus:border-berry focus:outline-none"
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-soft">
          {body.length}/{BODY_MAX}
        </span>
        <Button type="submit" disabled={pending || body.trim() === ""}>
          {pending ? "올리는 중" : "기록 남기기"}
        </Button>
      </div>
    </form>
  );
}
