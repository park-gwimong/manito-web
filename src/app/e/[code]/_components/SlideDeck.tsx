"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { formatTemp } from "@/lib/format";
import { finishPresentationAction } from "../actions";
import { AWARD_META, resultLabel, type Slide } from "./slides";

/**
 * 큰 화면용 발표. 한 화면에 한 장씩, 현재 장은 ?s=<번호>로 남겨 새로고침해도 유지된다.
 * 화살표 키, 화면 클릭, 아래 버튼으로 넘긴다.
 */
export function SlideDeck({ code, slides, initialIndex }: { code: string; slides: Slide[]; initialIndex: number }) {
  const [index, setIndex] = useState(initialIndex);
  const last = slides.length - 1;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(last, Math.max(0, next));
      setIndex(clamped);
      window.history.replaceState(null, "", `?s=${clamped}`);
    },
    [last],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(index - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const slide = slides[index];

  return (
    <div
      onClick={() => go(index + 1)}
      className="theme-light relative flex min-h-dvh cursor-pointer flex-col overflow-hidden bg-berry text-white select-none"
    >
      <span aria-hidden="true" className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-berry-deep" />
      <span aria-hidden="true" className="absolute -right-20 -bottom-28 h-96 w-96 rounded-full bg-berry-deep" />

      <div className="relative flex flex-1 flex-col items-center justify-center px-[6vw] py-[6vh] text-center">
        <SlideBody slide={slide} code={code} />
      </div>

      <div
        className="relative flex items-center justify-between gap-4 px-[4vw] pb-[3vh] text-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="min-h-12 rounded-pill px-6 font-semibold text-white/80 disabled:opacity-30"
        >
          ← 이전
        </button>
        <span aria-label={`${slides.length}장 중 ${index + 1}장`} className="font-display text-white/70">
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === last}
          className="min-h-12 rounded-pill px-6 font-semibold text-white/80 disabled:opacity-30"
        >
          다음 →
        </button>
      </div>
    </div>
  );
}

const BIG = "font-display text-[clamp(3rem,9vw,8rem)] leading-tight";
const MID = "font-display text-[clamp(1.75rem,4vw,3.5rem)] leading-snug";

function SlideBody({ slide, code }: { slide: Slide; code: string }) {
  switch (slide.kind) {
    case "summary":
      return (
        <>
          <p className={`${MID} text-white/80`}>우리 마니또가 끝났어요</p>
          <p className="font-display text-[clamp(5rem,18vw,16rem)] leading-none text-sun">
            {formatTemp(slide.summary.temperature)}
          </p>
          <p className={`${MID} text-white/80`}>우리 모임의 온도</p>
          <p className="mt-[4vh] text-[clamp(1.25rem,2.4vw,2rem)] text-white/90">
            기록 {slide.summary.recordCount}개 · 완료한 미션 {slide.summary.missionsCompleted}개
          </p>
        </>
      );
    case "question":
      return (
        <p className={BIG}>
          <span className="text-sun">{slide.receiverName}</span>
          <span>의</span>
          <br />
          마니또는…
        </p>
      );
    case "answer": {
      const { entry } = slide;
      const shown = entry.records.slice(0, 3);
      return (
        <>
          <p className={`${MID} text-white/80`}>{entry.receiver.name}의 마니또는</p>
          <p className="font-display text-[clamp(4rem,13vw,11rem)] leading-tight text-sun">{entry.giver.name}</p>
          <p className="font-display text-[clamp(2rem,5vw,4.5rem)] leading-tight">였습니다!</p>
          <div className="mt-[3vh] flex w-full max-w-4xl flex-col gap-3 text-[clamp(1rem,2vw,1.6rem)] text-white/90">
            {entry.guess && (
              <p>
                {entry.receiver.name}의 추측은 {entry.guess.name}
                {entry.guess.correct ? " — 딱 맞혔어요!" : " — 아쉬웠어요"}
              </p>
            )}
            {shown.length > 0 && (
              <ul className="flex flex-col gap-2">
                {shown.map((r, i) => (
                  <li key={i} className="rounded-field bg-berry-deep/70 px-5 py-3">
                    <span className="mr-3 font-semibold text-sun">{resultLabel(r.result)}</span>
                    {r.body}
                  </li>
                ))}
                {entry.records.length > shown.length && <li>그 밖에 기록 {entry.records.length - shown.length}개</li>}
              </ul>
            )}
            {entry.unnoticedDeeds.length > 0 && (
              <ul className="flex flex-col gap-2">
                {entry.unnoticedDeeds.slice(0, 3).map((d, i) => (
                  <li key={i} className="rounded-field border border-dashed border-white/40 px-5 py-3">
                    <span className="mr-3 font-semibold text-sun">몰래 한 일</span>
                    {d.body}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      );
    }
    case "awards": {
      const given = AWARD_META.filter((a) => slide.awards[a.key].length > 0);
      return (
        <>
          <p className={`${BIG} mb-[3vh]`}>시상식</p>
          {given.length === 0 ? (
            <p className={`${MID} text-white/80`}>이번에는 수상자가 없어요</p>
          ) : (
            <ul className="grid w-full max-w-6xl gap-4 md:grid-cols-2">
              {given.map((a) => (
                <li key={a.key} className="rounded-card bg-berry-deep/70 px-6 py-5">
                  <p className="text-[clamp(1.1rem,2vw,1.6rem)] text-white/80">{a.desc}</p>
                  <p className="font-display text-[clamp(1.5rem,3vw,2.5rem)] text-sun">{a.title}</p>
                  <p className="font-display text-[clamp(1.75rem,4vw,3.25rem)]">{slide.awards[a.key].join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    case "podium": {
      // 1등 숫자 대신, 가장 높은 점수와 같은 사람을 모두 똑같이 강조한다.
      const best = slide.top[0]?.total;
      return (
        <>
          <p className={`${BIG} mb-[4vh]`}>가장 빛난 사람들</p>
          <ul className="flex flex-wrap items-end justify-center gap-4">
            {slide.top.map((t) => {
              const top = t.total === best;
              return (
                <li
                  key={t.name}
                  className={`flex flex-col items-center gap-2 rounded-card px-8 py-6 ${
                    top ? "bg-sun text-sun-ink" : "bg-berry-deep/80"
                  }`}
                >
                  <span className="font-display text-[clamp(2rem,5vw,4.5rem)]">{t.name}</span>
                  <span className={`font-display text-[clamp(1.25rem,3vw,2.5rem)] ${top ? "text-berry-deep" : "text-sun"}`}>
                    {t.total}점
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      );
    }
    case "end":
      return <EndSlide code={code} />;
  }
}

function EndSlide({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await finishPresentationAction(code);
      if (result.ok) router.push(`/e/${code}/result`);
      else setError(result.error);
    });
  }

  return (
    <>
      <p className={BIG}>
        모두 수고했어요
        <br />
        <span className="text-sun">고마웠어요</span>
      </p>
      {error && (
        <p role="alert" className="mt-6 rounded-field bg-danger-tint px-5 py-3 text-lg font-medium text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        disabled={pending}
        className="mt-[5vh] min-h-16 rounded-pill bg-sun px-12 font-display text-[clamp(1.5rem,3vw,2.25rem)] text-sun-ink shadow-glow disabled:opacity-60"
      >
        {pending ? "마무리하는 중…" : "발표 끝내기"}
      </button>
    </>
  );
}
