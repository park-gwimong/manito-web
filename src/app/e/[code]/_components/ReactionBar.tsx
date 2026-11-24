"use client";

import { useState, useTransition } from "react";
import { REACTION_EMOJIS } from "@/domain/constants";
import type { FeedItem } from "@/domain/views";
import { toggleReactionAction } from "../actions";

export function ReactionBar({
  code,
  recordId,
  reactions,
  readOnly,
}: {
  code: string;
  recordId: string;
  reactions: FeedItem["reactions"];
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));

  function toggle(emoji: string) {
    setError(null);
    startTransition(async () => {
      const result = await toggleReactionAction(code, recordId, emoji);
      if (!result.ok) setError(result.error);
    });
  }

  // 읽기 전용에서는 반응이 달린 이모지만 보여 준다.
  const emojis = readOnly ? REACTION_EMOJIS.filter((e) => byEmoji.has(e)) : REACTION_EMOJIS;
  if (emojis.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {emojis.map((emoji) => {
          const r = byEmoji.get(emoji);
          const mine = r?.mine ?? false;
          return (
            <button
              key={emoji}
              type="button"
              disabled={readOnly || pending}
              aria-pressed={mine}
              onClick={() => toggle(emoji)}
              className={`flex min-h-10 min-w-12 items-center justify-center gap-1 rounded-pill border-2 px-3 text-base transition disabled:opacity-70 ${
                mine ? "border-sun bg-sun-tint" : "border-line bg-card"
              }`}
            >
              <span aria-hidden="true">{emoji}</span>
              {r && <span className="text-sm font-semibold text-ink">{r.count}</span>}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
