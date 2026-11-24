import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getDuty } from "@/domain/views";
import { getViewer } from "@/lib/viewer";
import { Card, Screen } from "../../../_components/ui";
import { AutoRefresh } from "../_components/AutoRefresh";
import { Feed } from "../_components/Feed";
import { MissionList } from "../_components/MissionList";
import { SecretDeeds } from "../_components/SecretDeeds";

export const metadata = { title: "내 임무" };

// 쿠키로 보는 사람이 정해지는 페이지라 요청마다 새로 그려진다. 내 마니또 대상은 이 화면에만 나온다.
export default async function DutyPage({ params }: PageProps<"/e/[code]/duty">) {
  const { code } = await params;
  const viewer = await getViewer(code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  if (!me) redirect(`/e/${event.code}`);

  const duty = event.status === "preparing" ? null : await getDuty(getDb(), event.id, me.id);
  const active = event.status === "active";

  return (
    <Screen>
      {active && <AutoRefresh />}
      <h1 className="font-display text-3xl leading-tight text-ink">내 임무</h1>
      {!duty ? (
        <p className="rounded-card border-2 border-dashed border-line px-5 py-8 text-center text-ink-soft">
          시작하면 여기에 나타나요
        </p>
      ) : (
        <>
          {!active && (
            <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium text-ink">
              이벤트가 끝났어요
            </p>
          )}
          <Card className="flex flex-col gap-1 bg-berry-tint">
            <span className="text-sm font-semibold text-ink-soft">내가 챙길 사람</span>
            <span className="font-display text-4xl text-berry-deep">{duty.target.name}</span>
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl text-ink">받은 미션</h2>
            <MissionList code={event.code} missions={duty.missions} readOnly={!active} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl text-ink">{duty.target.name}님이 올린 기록</h2>
            <Feed
              code={event.code}
              items={duty.targetRecords}
              readOnly={!active}
              emptyText="아직 올린 기록이 없어요."
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl text-ink">몰래 한 일</h2>
            <SecretDeeds code={event.code} deeds={duty.secretDeeds} readOnly={!active} />
          </section>
        </>
      )}
    </Screen>
  );
}
