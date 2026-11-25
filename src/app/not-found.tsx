import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "./_components/ui";

export const metadata: Metadata = { title: "찾을 수 없어요" };

/** 없는 주소나 없는 초대 코드로 들어왔을 때. 막다른 화면이 되지 않게 갈 곳을 알려 준다. */
export default function NotFound() {
  return (
    <Screen className="justify-center">
      <h1 className="font-display text-4xl leading-tight text-ink">이 주소에는 아무것도 없어요</h1>
      <p className="leading-relaxed text-ink-soft">
        초대 링크로 들어왔다면 주소가 끝까지 복사됐는지 확인해 주세요. 그래도 안 되면 개설자에게 링크를 다시 받아
        주세요.
      </p>
      <Link
        href="/"
        className="flex min-h-12 items-center justify-center self-start rounded-pill bg-berry px-6 font-semibold text-white shadow-glow transition hover:brightness-110 active:scale-[0.97]"
      >
        처음으로
      </Link>
    </Screen>
  );
}
