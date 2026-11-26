import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getDuty } from "@/domain/views";
import { getViewer } from "@/lib/viewer";
import { Screen, SectionTitle } from "../../../_components/ui";
import { AutoRefresh } from "../_components/AutoRefresh";
import { Feed } from "../_components/Feed";
import { MissionList } from "../_components/MissionList";
import { PushToggle } from "../_components/PushToggle";
import { SecretDeeds } from "../_components/SecretDeeds";
import { TargetEnvelope, TargetPrivacy, TargetRecords } from "../_components/TargetPrivacy";
import { pushPublicKey } from "@/lib/push";

export const metadata = { title: "내 임무" };

// 쿠키로 보는 사람이 정해지는 페이지라 요청마다 새로 그려진다. 내 마니또 대상은 이 화면에만 나오고,
// 그 이름과 이름이 드러나는 기록은 눌러서 열기 전까지 가려 둔다.
export default async function DutyPage({ params }: PageProps<"/e/[code]/duty">) {
  const { code } = await params;
  const viewer = await getViewer(code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  // 시작 전에는 메뉴도 내용도 없으므로 대기 화면으로 보낸다.
  if (!me || event.status === "preparing") redirect(`/e/${event.code}`);

  const duty = await getDuty(getDb(), event.id, me.id);
  const active = event.status === "active";

  return (
    <Screen>
      {active && <AutoRefresh />}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight text-ink">내 임무</h1>
        <p className="text-sm text-ink-soft">이 화면은 나만 볼 수 있어요. 챙길 사람의 이름은 눌렀을 때만 보여요.</p>
      </header>
      {!duty ? (
        <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-ink-soft">
          시작하면 여기에 나타나요
        </p>
      ) : (
        <TargetPrivacy>
          {!active && (
            <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm font-medium text-ink">
              이벤트가 끝났어요
            </p>
          )}
          {duty.reassigned && active && (
            <p role="status" className="rounded-field bg-sun-tint px-4 py-3 text-sm leading-relaxed font-medium text-ink">
              참가자 한 명이 나가서 내가 챙길 사람이 바뀌었어요. 아래 카드를 눌러 새로 챙길 사람을 확인해 주세요.
            </p>
          )}
          <TargetEnvelope name={duty.target.name} />

          <section className="flex flex-col gap-3">
            <SectionTitle>받은 미션</SectionTitle>
            <MissionList code={event.code} missions={duty.missions} readOnly={!active} />
          </section>

          <TargetRecords
            name={duty.target.name}
            todo={active ? duty.targetRecords.filter((r) => r.judge?.myVerdict === null).length : 0}
          >
            <Feed
              code={event.code}
              items={duty.targetRecords}
              readOnly={!active}
              emptyText="아직 올린 기록이 없어요."
            />
          </TargetRecords>

          <section className="flex flex-col gap-3">
            <SectionTitle>몰래 한 일</SectionTitle>
            <SecretDeeds code={event.code} deeds={duty.secretDeeds} readOnly={!active} />
          </section>

          {active && <PushToggle code={event.code} publicKey={pushPublicKey()} />}
        </TargetPrivacy>
      )}
    </Screen>
  );
}
