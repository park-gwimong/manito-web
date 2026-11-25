"use client";

import { useState, useTransition } from "react";
import { BODY_MAX } from "@/domain/constants";
import type { FeedItem } from "@/domain/views";
import { formatKst, formatKstTime } from "@/lib/format";
import { Avatar, Button, ErrorText } from "../../../_components/ui";
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

  const checked = item.verdictStatus === "done";

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 shadow-lift sm:p-5">
      <header className="flex items-center gap-3">
        <Avatar name={item.author.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg leading-tight text-ink">
            {item.author.name}
            {item.isMine && <span className="ml-2 font-sans text-xs font-semibold text-berry-deep">내가 쓴 글</span>}
          </span>
          <time dateTime={item.createdAt.toISOString()} title={formatKst(item.createdAt)} className="text-xs text-ink-soft">
            {formatKstTime(item.createdAt)}
          </time>
        </div>
        {/* 마니또가 확인했는지만 보인다. 맞았는지는 발표 때까지 아무에게도 보이지 않는다. */}
        <span
          className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${
            checked ? "bg-berry-tint text-berry-deep" : "border border-dashed border-line text-ink-soft"
          }`}
          title={checked ? "마니또가 확인했어요. 결과는 발표 때 공개돼요." : "아직 마니또가 확인하지 않았어요."}
        >
          {checked ? "마니또 확인 완료" : "마니또 확인 전"}
        </span>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={BODY_MAX}
            rows={3}
            aria-label="기록 수정"
            className="rounded-field border border-line bg-card px-4 py-3 text-base text-ink focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none"
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
        <p className="whitespace-pre-wrap text-[1.0625rem] leading-relaxed text-ink">{item.body}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ReactionBar code={code} recordId={item.id} reactions={item.reactions} readOnly={readOnly} />
        {!readOnly && item.isMine && !editing && (
          <div className="ml-auto flex gap-1 text-sm">
            <button
              type="button"
              className="min-h-11 rounded-field px-3 font-semibold text-ink-soft hover:bg-paper hover:text-ink"
              onClick={() => setEditing(true)}
            >
              수정
            </button>
            <button
              type="button"
              disabled={pending}
              className="min-h-11 rounded-field px-3 font-semibold text-danger hover:bg-danger-tint disabled:opacity-50"
              onClick={remove}
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {!readOnly && item.judge && <JudgeButtons code={code} recordId={item.id} myVerdict={item.judge.myVerdict} />}

      <ErrorText>{error}</ErrorText>
    </article>
  );
}
