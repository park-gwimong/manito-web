import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getRanking } from "@/domain/views";
import { getViewer } from "@/lib/viewer";
import { Card, Screen } from "../../../_components/ui";
import { AutoRefresh } from "../_components/AutoRefresh";

export const metadata = { title: "순위" };

export default async function RankPage({ params }: PageProps<"/e/[code]/rank">) {
  const { code } = await params;
  const viewer = await getViewer(code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  if (!me) redirect(`/e/${event.code}`);

  const { entries, stats } = await getRanking(getDb(), event.id, me.id);
  const max = Math.max(1, ...entries.map((e) => e.points));
  const { missionsDelivered, missionsCompleted, recordCount } = stats;

  return (
    <Screen>
      {event.status === "active" && <AutoRefresh />}
      <h1 className="font-display text-3xl leading-tight text-ink">순위</h1>

      <Card>
        <ul className="flex flex-col gap-4">
          {entries.map((e) => (
            <li
              key={e.id}
              aria-current={e.isMe ? "true" : undefined}
              className={`flex flex-col gap-1.5 rounded-field px-3 py-2 ${e.isMe ? "bg-sun-tint" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`font-display text-lg ${e.isMe ? "text-ink" : "text-ink-soft"}`}>
                  {e.name}
                  {e.isMe && <span className="ml-2 text-sm font-sans font-semibold text-berry-deep">나</span>}
                </span>
                <span className="font-display text-lg text-ink">{e.points}점</span>
              </div>
              <div className="h-3 overflow-hidden rounded-pill bg-paper-deep">
                <div
                  className={`h-full rounded-pill ${e.isMe ? "bg-berry" : "bg-berry/50"}`}
                  style={{ width: `${(e.points / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-card border-2 border-line bg-card px-4 py-3">
          <dt className="text-sm text-ink-soft">전체 기록</dt>
          <dd className="font-display text-2xl text-ink">{recordCount}개</dd>
        </div>
        {missionsDelivered > 0 && (
          <div className="rounded-card border-2 border-line bg-card px-4 py-3">
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
