import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { getRevealData, type RevealData } from "@/domain/reveal";
import { getViewer } from "@/lib/viewer";
import { Screen } from "../../../_components/ui";
import { ResultView } from "../_components/ResultView";

export const metadata = { title: "결과" };

// 공개 자격은 getRevealData가 판단한다. NOT_REVEALED면 홈으로 돌려보낸다.
export default async function ResultPage({ params }: PageProps<"/e/[code]/result">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  if (!me || event.status !== "revealed") redirect(`/e/${event.code}`);

  let data: RevealData;
  try {
    data = await getRevealData(getDb(), event.id, me.id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_REVEALED") redirect(`/e/${event.code}`);
    throw e;
  }

  return (
    <Screen>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-soft">{event.name}</p>
        <h1 className="font-display text-3xl leading-tight text-ink">마니또 결과</h1>
      </header>
      <ResultView data={data} meId={me.id} />
      <Link href={`/e/${event.code}`} className="text-center font-semibold text-berry-deep underline underline-offset-4">
        홈으로
      </Link>
    </Screen>
  );
}
