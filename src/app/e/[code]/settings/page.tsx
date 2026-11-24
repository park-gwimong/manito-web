import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { listTemplates } from "@/domain/missions";
import { countUnguessed } from "@/domain/reveal";
import { getLobby } from "@/domain/views";
import { toKstInput } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { Card, Screen } from "../../../_components/ui";
import { ParticipantAdmin } from "../_components/ParticipantAdmin";
import { PresentationStart, SettingsForm } from "../_components/SettingsForm";
import { TemplateEditor } from "../_components/TemplateEditor";

export const metadata = { title: "설정" };

// 개설자 전용. 개설자가 아니면 아무 데이터도 읽기 전에 홈으로 돌려보낸다.
export default async function SettingsPage({ params }: PageProps<"/e/[code]/settings">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  if (!me?.isOrganizer) redirect(`/e/${event.code}`);

  const db = getDb();
  const [lobby, templates, unguessed] = await Promise.all([
    getLobby(db, event.id),
    event.status === "preparing" ? listTemplates(db, event.id) : Promise.resolve([]),
    event.status === "closed" ? countUnguessed(db, event.id) : Promise.resolve(0),
  ]);
  const preparing = event.status === "preparing";

  return (
    <Screen>
      <h1 className="font-display text-3xl leading-tight text-ink">설정</h1>

      {preparing && (
        <>
          <SettingsForm
            code={event.code}
            name={event.name}
            startsAtInput={toKstInput(event.startsAt)}
            endsAtInput={toKstInput(event.endsAt)}
            missionCount={event.missionCount}
            templateCount={templates.length}
          />
          <TemplateEditor code={event.code} templates={templates} />
        </>
      )}

      {event.status === "closed" && (
        <PresentationStart
          code={event.code}
          started={event.presentationStartedAt !== null}
          unguessed={unguessed}
        />
      )}

      {event.status === "revealed" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-xl">결과</h2>
          <Link href={`/e/${event.code}/result`} className="font-semibold text-berry-deep underline underline-offset-4">
            결과 보러 가기
          </Link>
        </Card>
      )}

      <ParticipantAdmin code={event.code} participants={lobby.participants} canRemove={preparing} />
    </Screen>
  );
}
