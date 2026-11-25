"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import { Button, Card, ErrorText } from "../../../_components/ui";
import { addTemplateAction, deleteTemplateAction, updateTemplateAction } from "../actions";

type Template = { id: string; body: string };

/** 준비 중에만 보이는 미션 목록 편집. */
export function TemplateEditor({ code, templates }: { code: string; templates: Template[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newBody, setNewBody] = useState("");

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) onDone?.();
      else setError(result.error);
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl">미션 목록</h2>
        <span className="text-sm font-semibold text-ink-soft">{templates.length}개</span>
      </div>
      <ul className="flex flex-col gap-2">
        {templates.map((t) =>
          editingId === t.id ? (
            <li key={t.id} className="flex flex-col gap-2">
              <label className="sr-only" htmlFor={`tpl-${t.id}`}>
                미션 내용
              </label>
              <textarea
                id={`tpl-${t.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                className="rounded-field border border-line bg-card px-4 py-3 focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => updateTemplateAction(code, t.id, draft), () => setEditingId(null))}
                >
                  저장
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                  취소
                </Button>
              </div>
            </li>
          ) : (
            <li key={t.id} className="flex items-start justify-between gap-3 rounded-field bg-paper px-4 py-3">
              <span className="py-2 leading-relaxed">{t.body}</span>
              <span className="flex shrink-0 gap-3 text-sm">
                <button
                  type="button"
                  className="min-h-11 font-semibold text-berry-deep underline underline-offset-4"
                  aria-label={`미션 수정: ${t.body}`}
                  onClick={() => {
                    setEditingId(t.id);
                    setDraft(t.body);
                  }}
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-11 font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
                  aria-label={`미션 삭제: ${t.body}`}
                  onClick={() => run(() => deleteTemplateAction(code, t.id))}
                >
                  삭제
                </button>
              </span>
            </li>
          ),
        )}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addTemplateAction(code, newBody), () => setNewBody(""));
        }}
      >
        <label htmlFor="new-template" className="text-sm font-semibold">
          미션 추가
        </label>
        <input
          id="new-template"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="예: 오늘 커피 한 잔 챙겨 주기"
          className="min-h-12 rounded-field border border-line bg-card px-4 focus:border-berry focus:ring-4 focus:ring-berry/15 focus:outline-none"
        />
        <Button type="submit" variant="soft" disabled={pending || newBody.trim() === ""}>
          추가하기
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
