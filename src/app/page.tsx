import Link from "next/link";
import { BASE_TEMP } from "@/domain/constants";
import { isDev } from "@/dev/overview";
import { formatTemp } from "@/lib/format";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))] lg:max-w-6xl lg:justify-center lg:px-8">
      {isDev() && (
        <Link
          href="/dev"
          className="flex items-center justify-between gap-3 rounded-pill bg-ink py-2 pr-2 pl-5 text-sm font-semibold text-paper lg:self-start"
        >
          개발 서버예요. 샘플 이벤트로 기능을 둘러보세요
          <span className="rounded-pill bg-sun px-3 py-1.5 text-sun-ink">둘러보기</span>
        </Link>
      )}

      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <section className="flex flex-col gap-6">
          <h1 className="font-display text-[clamp(2.75rem,6.4vw,5.25rem)] leading-[1.05] text-ink">
            누가 나를
            <br />
            챙기고 있을까?
          </h1>
          <p className="max-w-[32ch] text-lg leading-relaxed text-ink-soft lg:text-xl">
            정해진 기간 동안 한 사람을 몰래 챙겨 주는 마니또 놀이예요. 5명에서 10명쯤 되는 모임에 맞아요.
          </p>
          <div className="flex flex-col gap-3 sm:max-w-sm">
            <Link
              href="/new"
              className="flex min-h-14 items-center justify-center rounded-pill bg-berry px-6 text-lg font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.97]"
            >
              이벤트 만들기
            </Link>
            <p className="text-sm leading-relaxed text-ink-soft">
              참가하려면 개설자에게 받은 초대 링크로 들어와 주세요.
            </p>
            <Link
              href="/guide"
              className="flex min-h-11 items-center self-start text-sm font-semibold text-berry-deep underline underline-offset-4"
            >
              어떻게 하는 건지 자세히 보기
            </Link>
          </div>
        </section>

        {/* 진행 순서 세 단계. 크기와 색이 다른 칸으로 나눠 담는다. */}
        <ol className="grid gap-3 sm:grid-cols-2">
          <li className="flex items-center gap-4 rounded-card border border-line bg-card p-6 shadow-lift sm:col-span-2">
            <div className="flex flex-1 flex-col gap-2">
              <StepNumber n={1} />
              <h2 className="font-display text-2xl text-ink">몰래 뽑아요</h2>
              <p className="leading-relaxed text-ink-soft">
                시작하는 날, 한 사람씩 챙길 대상이 정해져요. 누가 나를 뽑았는지는 아무도 몰라요.
              </p>
            </div>
            <Envelope />
          </li>

          <li className="flex flex-col gap-2 rounded-card bg-berry p-6 text-white shadow-glow">
            <StepNumber n={2} />
            <h2 className="font-display text-2xl">받은 마음을 기록해요</h2>
            <p className="leading-relaxed text-white/85">
              받은 사람이 글로 남기면 모두의 피드에 올라가고 모임 온도가 올라요.
            </p>
            <p className="mt-auto pt-4 font-display text-4xl leading-none" aria-hidden="true">
              {formatTemp(BASE_TEMP)}
              <span className="ml-1 text-2xl text-sun">↑</span>
            </p>
          </li>

          <li className="flex flex-col gap-2 rounded-card bg-sun-tint p-6">
            <StepNumber n={3} />
            <h2 className="font-display text-2xl text-ink">마지막 날 함께 열어요</h2>
            <p className="leading-relaxed text-ink-soft">
              내 마니또를 맞혀 보고, 큰 화면에서 한 명씩 공개해요. 끝내 몰랐던 선행도 그때 알게 돼요.
            </p>
          </li>
        </ol>
      </div>
    </main>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-sun font-display text-base text-sun-ink"
    >
      {n}
    </span>
  );
}

/** 봉인된 편지 봉투. 서비스의 상징으로 첫 화면에만 쓴다. */
function Envelope() {
  return (
    <svg viewBox="0 0 120 84" className="h-20 w-28 shrink-0 -rotate-6 lg:h-24 lg:w-36" aria-hidden="true">
      <rect x="2" y="2" width="116" height="80" rx="12" fill="var(--color-berry-tint)" />
      <path
        d="M6 10 L60 48 L114 10"
        fill="none"
        stroke="var(--color-berry)"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="60" cy="48" r="13" fill="var(--color-berry)" />
      <path
        d="M60 54 C53 49 54 43 57.5 43 C59 43 60 44.5 60 44.5 C60 44.5 61 43 62.5 43 C66 43 67 49 60 54 Z"
        fill="var(--color-sun)"
      />
    </svg>
  );
}
