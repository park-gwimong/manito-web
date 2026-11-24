"use client";

import { useState, useTransition } from "react";
import { BODY_MAX } from "@/domain/constants";
import type { FeedItem } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { Button, ErrorText } from "../../../_components/ui";
import { deleteRecordAction, updateRecordAction } from "../actions";
import { JudgeButtons } from "./JudgeButtons";
import { ReactionBar } from "./ReactionBar";

export function FeedCard({ code, item, readOnly = false }: { code: string; item: FeedItem; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRecordAction(code, item.id, draft);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  }

  function remove() {
    if (!window.confirm("이 기록을 지울까요?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteRecordAction(code, item.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border-2 border-line bg-card p-5 shadow-lift">
      <header className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg text-ink">{item.author.name}</span>
        <time dateTime={item.createdAt.toISOString()} className="text-xs text-ink-soft">
          {formatKst(item.createdAt)}
        </time>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BODY_MAX}
            rows={3}
            aria-label="기록 수정"
            className="rounded-field border-2 border-line bg-card px-4 py-3 text-base text-ink focus:border-berry focus:outline-none"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={pending || draft.trim() === ""}>
              저장
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(item.body);
                setError(null);
              }}
            >
              취소
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{item.body}</p>
      )}

      <ReactionBar code={code} recordId={item.id} reactions={item.reactions} readOnly={readOnly} />

      <p className="text-xs text-ink-soft">
        마니또 확인: {item.verdictStatus === "done" ? "완료 (결과는 종료 때 공개)" : "대기 중"}
      </p>

      {!readOnly && item.judge && <JudgeButtons code={code} recordId={item.id} myVerdict={item.judge.myVerdict} />}

      <ErrorText>{error}</ErrorText>

      {!readOnly && item.isMine && !editing && (
        <div className="flex gap-4 text-sm">
          <button
            type="button"
            className="font-semibold text-berry-deep underline underline-offset-4"
            onClick={() => setEditing(true)}
          >
            수정
          </button>
          <button
            type="button"
            disabled={pending}
            className="font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
            onClick={remove}
          >
            삭제
          </button>
        </div>
      )}
    </article>
  );
}
