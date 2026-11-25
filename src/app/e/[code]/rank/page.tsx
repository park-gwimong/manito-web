import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getRanking } from "@/domain/views";
import { getViewer } from "@/lib/viewer";
import { Avatar, Card, Screen } from "../../../_components/ui";
import { AutoRefresh } from "../_components/AutoRefresh";

export const metadata = { title: "순위" };

export default async function RankPage({ params }: PageProps<"/e/[code]/rank">) {
  const { code } = await params;
  const viewer = await getViewer(code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  // 시작 전에는 메뉴도 내용도 없으므로 대기 화면으로 보낸다.
  if (!me || event.status === "preparing") redirect(`/e/${event.code}`);

  const { entries, stats } = await getRanking(getDb(), event.id, me.id);
  const max = Math.max(1, ...entries.map((e) => e.points));
  const { missionsDelivered, missionsCompleted, recordCount } = stats;

  return (
    <Screen>
      {event.status === "active" && <AutoRefresh />}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight text-ink">순위</h1>
        <p className="text-sm text-ink-soft">기록과 미션으로 쌓은 참여 포인트예요. 판정과 추측 보너스는 발표 때 더해져요.</p>
      </header>

      <Card>
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              aria-current={e.isMe ? "true" : undefined}
              className={`flex items-center gap-3 rounded-field px-3 py-2.5 ${e.isMe ? "bg-sun-tint" : ""}`}
            >
              <Avatar name={e.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-lg text-ink">
                    {e.name}
                    {e.isMe && <span className="ml-2 font-sans text-xs font-semibold text-berry-deep">나</span>}
                  </span>
                  <span className="font-display text-lg text-ink">{e.points}점</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-pill bg-paper-deep">
                  <div
                    className={`h-full rounded-pill ${e.isMe ? "bg-berry" : "bg-berry/45"}`}
                    style={{ width: `${(e.points / max) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-line bg-card px-4 py-3">
          <dt className="text-sm text-ink-soft">전체 기록</dt>
          <dd className="font-display text-2xl text-ink">{recordCount}개</dd>
        </div>
        {missionsDelivered > 0 && (
          <div className="rounded-card border border-line bg-card px-4 py-3">
            <dt className="text-sm text-ink-soft">미션 완료율</dt>
            <dd className="font-display text-2xl text-ink">
              {Math.round((missionsCompleted / missionsDelivered) * 100)}%
            </dd>
          </div>
        )}
      </dl>
    </Screen>
  );
}
