import Link from "next/link";
import { Screen } from "./_components/ui";

export default function Home() {
  return (
    <Screen className="justify-between">
      <div className="flex flex-col gap-6 pt-10">
        <Envelope />
        <h1 className="font-display text-5xl leading-tight text-ink">
          누가 나를
          <br />
          챙기고 있을까?
        </h1>
        <p className="text-lg leading-relaxed text-ink-soft">
          제비뽑기로 정해진 한 사람을 정해진 기간 동안 몰래 챙겨 주는 놀이예요. 매일 받은 마음을 기록하고, 마지막 날
          누가 내 마니또였는지 함께 공개해요.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="rounded-field bg-sun-tint px-4 py-3 text-sm leading-relaxed text-ink">
          참가하려면 개설자에게 받은 초대 링크로 들어와 주세요.
        </p>
        <Link
          href="/new"
          className="flex min-h-12 items-center justify-center rounded-pill bg-berry px-6 text-base font-semibold text-white shadow-[0_3px_0_0_var(--color-berry-deep)] active:translate-y-[2px] active:shadow-none"
        >
          이벤트 만들기
        </Link>
      </div>
    </Screen>
  );
}

/** 봉인된 편지 봉투. 서비스의 상징으로 첫 화면에만 쓴다. */
function Envelope() {
  return (
    <svg viewBox="0 0 120 84" className="h-20 w-28" aria-hidden="true">
      <rect x="2" y="2" width="116" height="80" rx="10" fill="var(--color-card)" stroke="var(--color-line)" strokeWidth="3" />
      <path d="M4 8 L60 48 L116 8" fill="none" stroke="var(--color-line)" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="60" cy="48" r="13" fill="var(--color-berry)" />
      <path
        d="M60 54 C53 49 54 43 57.5 43 C59 43 60 44.5 60 44.5 C60 44.5 61 43 62.5 43 C66 43 67 49 60 54 Z"
        fill="var(--color-sun)"
      />
    </svg>
  );
}
