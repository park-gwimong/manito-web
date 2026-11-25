import type { RevealData } from "@/domain/reveal";
import { formatTemp } from "@/lib/format";
import { Card } from "../../../_components/ui";
import { ScoreLines } from "./ScoreLines";
import { AWARD_META, resultLabel } from "./slides";

/** 발표가 끝난 뒤 모두가 보는 결과. 서버에서 그려지고 상호작용이 없다. 등수 숫자는 쓰지 않는다. */
export function ResultView({ data, meId }: { data: RevealData; meId: string }) {
  const { summary, chain, scores, awards, missions } = data;
  const max = Math.max(1, ...scores.map((s) => s.score.total));
  const given = AWARD_META.filter((a) => awards[a.key].length > 0);

  return (
    <>
      <section className="rounded-card bg-berry p-6 text-white">
        <p className="text-sm text-white/80">우리 모임의 최종 온도</p>
        <p className="font-display text-6xl leading-tight text-sun">{formatTemp(summary.temperature)}</p>
        <p className="text-sm text-white/90">
          기록 {summary.recordCount}개 · 완료한 미션 {summary.missionsCompleted}개
        </p>
      </section>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl">누가 누구의 마니또였을까</h2>
        <ul className="flex flex-col gap-2">
          {chain.map((c) => (
            <li key={c.receiver.id} className="flex flex-wrap items-center gap-x-2 rounded-field bg-paper px-4 py-2">
              <span className="font-semibold text-berry-deep">{c.giver.name}</span>
              <span className="text-sm text-ink-soft">→</span>
              <span className="font-semibold">{c.receiver.name}</span>
              <span className="sr-only">의 마니또였어요</span>
            </li>
          ))}
        </ul>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">사람별 이야기</h2>
        {chain.map((c) => (
          <Card key={c.receiver.id} className="flex flex-col gap-3">
            <h3 className="font-display text-lg">
              {c.receiver.name}의 마니또는 <span className="text-berry">{c.giver.name}</span>
            </h3>
            {c.guess && (
              <p className="text-sm text-ink-soft">
                {c.receiver.name}의 추측: {c.guess.name}{" "}
                <strong className={c.guess.correct ? "text-berry-deep" : "text-ink-soft"}>
                  {c.guess.correct ? "(맞혔어요)" : "(아쉬웠어요)"}
                </strong>
              </p>
            )}
            {/* 비어 있는 부분은 아예 그리지 않는다. 아무것도 안 한 사람을 드러내지 않기 위해서다. */}
            {c.records.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold">{c.receiver.name}의 기록</p>
                <ul className="flex flex-col gap-1.5">
                  {c.records.map((r, i) => (
                    <li key={i} className="flex gap-2 rounded-field bg-paper px-3 py-2 text-sm">
                      <span
                        className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold ${
                          r.result === true
                            ? "bg-berry text-white"
                            : r.result === false
                              ? "bg-danger-tint text-danger"
                              : "bg-paper-deep text-ink-soft"
                        }`}
                      >
                        {resultLabel(r.result)}
                      </span>
                      <span className="leading-relaxed">{r.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.unnoticedDeeds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold">{c.giver.name}이(가) 몰래 한 일</p>
                <ul className="flex flex-col gap-1.5">
                  {c.unnoticedDeeds.map((d, i) => (
                    <li key={i} className="rounded-field border border-dashed border-line px-3 py-2 text-sm leading-relaxed">
                      {d.body}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </section>

      {given.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-xl">시상</h2>
          <dl className="flex flex-col gap-3">
            {given.map((a) => (
              <div key={a.key}>
                <dt className="text-sm text-ink-soft">
                  <span className="font-display text-base text-berry">{a.title}</span> · {a.desc}
                </dt>
                <dd className="font-display text-lg">{awards[a.key].join(", ")}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {missions.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl">이번 미션 목록</h2>
            <p className="text-sm leading-relaxed text-ink-soft">
              진행 중에는 각자 받은 미션만 볼 수 있었어요. 이 {missions.length}개 중에서 사람마다 무작위로 받았어요.
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {missions.map((m) => (
              <li key={m.body} className="flex flex-col gap-0.5 rounded-field bg-paper px-3 py-2 text-sm">
                <span className="leading-relaxed">{m.body}</span>
                {m.completedBy.length > 0 && (
                  <span className="text-xs font-semibold text-berry-deep">해낸 사람: {m.completedBy.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-display text-xl">최종 점수</h2>
        <p className="mb-4 text-sm text-ink-soft">이름 아래에 어디서 받은 점수인지 나와요.</p>
        <ul className="flex flex-col gap-4">
          {scores.map((s) => {
            const isMe = s.id === meId;
            return (
              <li
                key={s.id}
                aria-current={isMe ? "true" : undefined}
                className={`flex flex-col gap-1.5 rounded-field px-3 py-2 ${isMe ? "bg-sun-tint" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-display text-lg ${isMe ? "text-ink" : "text-ink-soft"}`}>
                    {s.name}
                    {isMe && <span className="ml-2 font-sans text-sm font-semibold text-berry-deep">나</span>}
                  </span>
                  <span className="font-display text-lg text-ink">{s.score.total}점</span>
                </div>
                <div className="h-3 overflow-hidden rounded-pill bg-paper-deep">
                  <div
                    className={`h-full rounded-pill ${isMe ? "bg-berry" : "bg-berry/50"}`}
                    style={{ width: `${(s.score.total / max) * 100}%` }}
                  />
                </div>
                <ScoreLines lines={s.score.lines} />
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
