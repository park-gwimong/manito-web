import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { listTemplates } from "@/domain/missions";
import { countUnguessed } from "@/domain/reveal";
import { getLobby } from "@/domain/views";
import { toKstInput } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { BackLink, Card, Screen } from "../../../_components/ui";
import { ActiveControls } from "../_components/OrganizerControls";
import { ParticipantAdmin } from "../_components/ParticipantAdmin";
import { PresentationStart, SettingsForm } from "../_components/SettingsForm";
import { TemplateEditor } from "../_components/TemplateEditor";

export const metadata = { title: "설정" };

// 개설자 전용. 개설자가 아니면 아무 데이터도 읽기 전에 홈으로 돌려보낸다.
export default async function SettingsPage({ params, searchParams }: PageProps<"/e/[code]/settings">) {
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
  // 발표 화면에서 나올 때 넘겨받은 장 번호. 다시 열 때 그 장부터 이어 준다.
  const rawSlide = Number((await searchParams).s);
  const resumeAt = Number.isInteger(rawSlide) && rawSlide > 0 ? rawSlide : 0;

  return (
    <Screen>
      {/* 준비 단계에는 메뉴가 없으므로 대기 화면으로 돌아가는 길을 둔다. */}
      {preparing && <BackLink href={`/e/${event.code}`}>대기 화면으로</BackLink>}
      <h1 className="font-display text-3xl leading-tight text-ink">설정</h1>

      {preparing && (
        <>
          <SettingsForm
            code={event.code}
            name={event.name}
            startsAtInput={toKstInput(event.startsAt)}
            endsAtInput={toKstInput(event.endsAt)}
            missionCount={event.missionCount}
            missionMode={event.missionMode}
            missionHour={event.missionHour}
            templateCount={templates.length}
          />
          <TemplateEditor code={event.code} templates={templates} />
        </>
      )}

      {event.status === "active" && <ActiveControls code={event.code} endsAtInput={toKstInput(event.endsAt)} />}

      {event.status === "closed" && (
        <PresentationStart
          code={event.code}
          started={event.presentationStartedAt !== null}
          unguessed={unguessed}
          resumeAt={resumeAt}
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

      {preparing && (
        <Link
          href={`/e/${event.code}`}
          className="flex min-h-12 items-center justify-center rounded-pill bg-berry-tint px-6 font-semibold text-berry-deep"
        >
          대기 화면으로 돌아가기
        </Link>
      )}

      <ParticipantAdmin
        code={event.code}
        participants={lobby.participants}
        canRemove={preparing || event.status === "active"}
        midEvent={event.status === "active"}
      />
    </Screen>
  );
}
