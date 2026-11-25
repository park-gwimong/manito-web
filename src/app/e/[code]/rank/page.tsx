import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { RECORD_DAILY_CAP } from "@/domain/constants";
import { SCORE_RULES } from "@/domain/scoring";
import { getRanking } from "@/domain/views";
import { getViewer } from "@/lib/viewer";
import { Avatar, Card, Screen } from "../../../_components/ui";
import { AutoRefresh } from "../_components/AutoRefresh";
import { ScoreLines } from "../_components/ScoreLines";

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
        <p className="text-sm text-ink-soft">기록과 미션으로 쌓은 참여 포인트예요. 이름 아래에 어디서 받은 점수인지 나와요.</p>
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
                <ScoreLines lines={e.lines} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl">점수는 이렇게 쌓여요</h2>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-ink">지금 쌓이는 점수</p>
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">
            {SCORE_RULES.filter((r) => !r.final).map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span>
                  {r.label}
                  {r.key === "record" && ` (하루 ${RECORD_DAILY_CAP}개까지)`}
                </span>
                <span className="shrink-0 font-semibold text-ink">한 개에 {r.each}점</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-ink">발표 때 더해지는 점수</p>
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">
            {SCORE_RULES.filter((r) => r.final).map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span>{r.label}</span>
                <span className="shrink-0 font-semibold text-ink">
                  {r.key === "guess" ? `${r.each}점` : r.key === "secretDeed" ? `하루에 ${r.each}점` : `한 개에 ${r.each}점`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-ink-soft">
            누가 누구의 마니또인지 드러나지 않도록, 이 점수들은 발표가 끝난 뒤 결과 화면에서 사람별로 공개돼요.
          </p>
        </div>
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
