import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getPinResetTrace } from "@/domain/participants";
import { getMyGuess } from "@/domain/reveal";
import { getFeed, getHeader, getLobby } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { getViewer, listLoginCandidates } from "@/lib/viewer";
import { GuideLink, Screen } from "../../_components/ui";
import { AutoRefresh } from "./_components/AutoRefresh";
import { Feed } from "./_components/Feed";
import { GuessForm } from "./_components/GuessForm";
import { Header } from "./_components/Header";
import { JoinForm } from "./_components/JoinForm";
import { Lobby } from "./_components/Lobby";
import { LoginForm } from "./_components/LoginForm";
import { PinResetTrace } from "./_components/PinResetTrace";
import { PushToggle } from "./_components/PushToggle";
import { pushPublicKey } from "@/lib/push";
import { RecordForm } from "./_components/RecordForm";

const STATUS_LABEL = {
  active: "진행 중인 마니또",
  closed: "끝난 마니또 · 발표를 기다리고 있어요",
  revealed: "끝난 마니또 · 결과가 공개됐어요",
} as const;

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
            {event.status === "preparing" ? `${formatKst(event.startsAt)}에 시작해요` : STATUS_LABEL[event.status]}
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">{event.name}</h1>
        </header>
        {preparing ? (
          <>
            <JoinForm code={event.code} />
            {candidates.length > 0 && (
              <details className="group rounded-card border border-dashed border-line px-5 py-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-berry-deep">
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
        <GuideLink>마니또가 처음이라면: 사용 설명서 보기</GuideLink>
      </Screen>
    );
  }

  const db = getDb();
  if (event.status === "preparing") {
    const [lobby, trace] = await Promise.all([getLobby(db, event.id), getPinResetTrace(db, me.id)]);
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
        pinResetAtLabel={trace ? formatKst(trace.resetAt) : null}
      />
    );
  }

  const active = event.status === "active";
  const closed = event.status === "closed";
  const [header, feed, lobby, myGuessId, trace] = await Promise.all([
    getHeader(db, event, new Date()),
    getFeed(db, event.id, me.id),
    closed ? getLobby(db, event.id) : null,
    closed ? getMyGuess(db, me.id) : null,
    getPinResetTrace(db, me.id),
  ]);
  return (
    <Screen>
      {active && <AutoRefresh />}
      {/* 마감 뒤에도 "발표 시작 → 추측 잠김"과 결과 공개를 새로고침 없이 받는다. */}
      {closed && <AutoRefresh intervalMs={30_000} />}
      <Header eventName={event.name} temperature={header.temperature} dday={header.dday} />
      <h1 className="hidden font-display text-3xl leading-tight text-ink lg:block">모두의 기록</h1>
      {trace && <PinResetTrace resetAtLabel={formatKst(trace.resetAt)} />}
      {(active || closed) && <PushToggle code={event.code} publicKey={pushPublicKey()} hideWhenOn />}
      {active && <RecordForm code={event.code} />}
      {closed && (
        <>
          <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium text-ink">
            이벤트가 끝났어요. 발표를 기다려 주세요
          </p>
          <GuessForm
            code={event.code}
            candidates={(lobby?.participants ?? []).filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }))}
            initialGuessId={myGuessId}
            locked={event.presentationStartedAt !== null}
          />
        </>
      )}
      {event.status === "revealed" && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-field bg-sun-tint py-2 pr-2 pl-4 text-sm font-medium text-ink">
          이벤트가 끝났어요.
          <Link
            href={`/e/${event.code}/result`}
            className="flex min-h-11 shrink-0 items-center rounded-pill bg-berry px-5 font-semibold text-white"
          >
            결과 보러 가기
          </Link>
        </div>
      )}
      <Feed code={event.code} items={feed} readOnly={!active} />
    </Screen>
  );
}
