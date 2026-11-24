import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { getRevealData, type RevealData } from "@/domain/reveal";
import { getViewer } from "@/lib/viewer";
import { SlideDeck } from "../_components/SlideDeck";
import { buildSlides } from "../_components/slides";

export const metadata = { title: "결과 발표" };

// 개설자 전용 큰 화면. 공개 자격(발표 시작 여부 포함)은 getRevealData가 판단하고, 여기서는 그 오류로 돌려보내기만 한다.
export default async function PresentPage({ params, searchParams }: PageProps<"/e/[code]/present">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  if (!me?.isOrganizer) redirect(`/e/${event.code}`);
  if (event.status === "revealed") redirect(`/e/${event.code}/result`);

  let data: RevealData;
  try {
    data = await getRevealData(getDb(), event.id, me.id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_REVEALED") redirect(`/e/${event.code}/settings`);
    throw e;
  }

  const slides = buildSlides(data);
  const raw = Number((await searchParams).s);
  const initialIndex = Number.isInteger(raw) ? Math.min(slides.length - 1, Math.max(0, raw)) : 0;

  return <SlideDeck code={event.code} slides={slides} initialIndex={initialIndex} />;
}
