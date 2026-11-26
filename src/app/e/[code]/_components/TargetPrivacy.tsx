"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SectionTitle } from "../../../_components/ui";

/**
 * 내가 챙길 사람의 이름은 지나가던 사람이 화면을 보고 알 수 있으면 안 된다.
 * 처음에는 가려 두고 눌렀을 때만 보여 준다. 화면을 떠났다 돌아오면 다시 가린다.
 */
const Shown = createContext<{ shown: boolean; setShown: (v: boolean) => void }>({
  shown: false,
  setShown: () => {},
});

export function TargetPrivacy({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hide = () => {
      if (document.hidden) setShown(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  return <Shown value={{ shown, setShown }}>{children}</Shown>;
}

/** 봉투 카드. 누르면 이름이 열리고, 다시 누르면 닫힌다. */
export function TargetEnvelope({ name }: { name: string }) {
  const { shown, setShown } = useContext(Shown);

  return (
    <section className="relative overflow-hidden rounded-card bg-berry text-white shadow-glow">
      {/* 봉투 덮개 */}
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-16 w-full text-berry-deep/40"
      >
        <path d="M0 0 L50 38 L100 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown(!shown)}
        className="relative flex w-full flex-col px-6 py-6 text-left"
      >
        <span className="text-sm font-semibold text-white/80">내가 몰래 챙길 사람</span>
        {shown ? (
          <>
            <span className="mt-1 font-display text-5xl leading-tight">{name}</span>
            <span className="mt-2 text-sm text-white/80">다시 누르면 가려져요</span>
          </>
        ) : (
          <>
            <span className="mt-1 font-display text-3xl leading-tight">눌러서 확인하기</span>
            <span className="mt-2 text-sm text-white/80">주변에 보는 사람이 없을 때 열어 보세요</span>
          </>
        )}
      </button>
    </section>
  );
}

/** 그 사람이 올린 기록. 기록에는 이름이 나오므로 이름을 열었을 때만 보여 준다. */
export function TargetRecords({ name, todo, children }: { name: string; todo: number; children: ReactNode }) {
  const { shown, setShown } = useContext(Shown);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{shown ? `${name}님이 올린 기록` : "챙길 사람이 올린 기록"}</SectionTitle>
      {shown ? (
        children
      ) : (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="rounded-field border border-dashed border-line px-4 py-5 text-left text-sm leading-relaxed text-ink-soft"
        >
          기록에는 이름이 나와서 가려 두었어요. 누르면 보여요.
          {todo > 0 && <span className="mt-1 block font-medium text-ink">답하지 않은 마니또 확인 질문이 {todo}개 있어요.</span>}
        </button>
      )}
    </section>
  );
}
