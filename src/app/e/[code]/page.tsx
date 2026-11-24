import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getLobby } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { getViewer, listLoginCandidates } from "@/lib/viewer";
import { Screen } from "../../_components/ui";
import { JoinForm } from "./_components/JoinForm";
import { Lobby } from "./_components/Lobby";
import { LoginForm } from "./_components/LoginForm";

export default async function EventPage({ params }: PageProps<"/e/[code]">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;

  if (!me) {
    const candidates = await listLoginCandidates(event.id);
    const preparing = event.status === "preparing";
    return (
      <Screen>
        <header className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">
            {preparing ? `${formatKst(event.startsAt)}에 시작해요` : "진행 중인 마니또"}
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">{event.name}</h1>
        </header>
        {preparing ? (
          <>
            <JoinForm code={event.code} />
            {candidates.length > 0 && (
              <details className="group rounded-card border-2 border-dashed border-line px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-berry-deep">
                  이미 입장했어요
                  <span className="ml-1 inline-block transition group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="pt-4">
                  <LoginForm code={event.code} candidates={candidates} />
                </div>
              </details>
            )}
          </>
        ) : (
          <LoginForm code={event.code} candidates={candidates} />
        )}
      </Screen>
    );
  }

  if (event.status === "preparing") {
    const lobby = await getLobby(getDb(), event.id);
    return (
      <Lobby
        code={event.code}
        eventName={event.name}
        startsAtLabel={formatKst(event.startsAt)}
        participants={lobby.participants}
        meId={me.id}
        isOrganizer={me.isOrganizer}
        startMissed={lobby.startMissed}
        minParticipants={lobby.minParticipants}
      />
    );
  }

  // 진행·마감·공개 단계의 홈은 다음 작업에서 채운다.
  return (
    <Screen>
      <h1 className="font-display text-4xl leading-tight text-ink">{event.name}</h1>
      <p className="text-ink-soft">마니또가 시작됐어요.</p>
    </Screen>
  );
}
