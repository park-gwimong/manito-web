import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import type { EventStatus } from "@/db/schema";
import { DEV_ADMIN_PASSWORD } from "@/dev/bootstrap";
import { DEMO_PIN } from "@/dev/demo-seed";
import { getDevOverview, isDev, type DevEvent } from "@/dev/overview";
import { formatKst } from "@/lib/format";
import { devEnterAction } from "./actions";

export const metadata = { title: "둘러보기 (개발 전용)" };
export const dynamic = "force-dynamic";

const STAGE: Record<EventStatus, { label: string; summary: string; checks: string[] }> = {
  preparing: {
    label: "준비",
    summary: "아직 시작 전이에요. 초대 링크로 사람이 모이는 단계예요.",
    checks: [
      "로그아웃 상태로 초대 링크를 열어 새 이름과 PIN으로 입장해 보기",
      "개설자(민지)로 들어가 설정에서 일정, 미션 개수, 미션 목록 고치기",
      "개설자로 대기 화면의 지금 시작하기를 눌러 바로 진행 단계로 넘어가는지 확인하기",
      "개설자로 참가자를 내보내거나 PIN을 초기화하고, 그 참가자로 다시 들어가 안내 문구 확인하기",
    ],
  },
  active: {
    label: "진행",
    summary: "3일 전에 시작해 기록, 반응, 판정, 미션이 쌓여 있어요.",
    checks: [
      "홈에서 기록을 쓰고, 고치고, 다른 사람 글에 반응 달기",
      "아래 배정표에서 내 대상을 확인하고, 내 임무에서 그 대상이 쓴 기록에만 판정 버튼이 보이는지 확인하기 (홈에는 없어야 해요)",
      "내 임무 메뉴의 숫자가 남은 미션과 답하지 않은 기록 수와 맞는지 확인하기",
      "개설자(민지)로 설정에서 종료 일시 바꾸기, 참가자 내보내기(대상 이어받기), 지금 마감하기",
      "내 임무에서 미션 완료 체크, 몰래 한 일 메모 남기기",
      "순위에서 기록·미션만 점수에 반영되고 판정으로는 점수가 움직이지 않는지 확인하기",
    ],
  },
  closed: {
    label: "마감",
    summary: "어제 끝났고 발표를 기다리는 중이에요.",
    checks: [
      "참가자로 들어가 내 마니또 추측을 바꿔 보기",
      "개설자(민지)로 설정에서 결과 발표 시작 → 큰 화면에서 한 장씩 넘기기",
      "발표를 시작한 뒤 다른 참가자의 추측이 잠기는지, 발표를 끝내면 결과가 열리는지 확인하기",
    ],
  },
  revealed: {
    label: "발표 완료",
    summary: "발표까지 끝나 누구나 결과를 볼 수 있어요.",
    checks: ["결과 화면에서 마니또 공개, 적중·미확인 기록, 몰랐던 선행, 최종 점수와 상 확인하기"],
  },
};

export default async function DevPage() {
  if (!isDev()) notFound();
  const events = await getDevOverview(getDb());

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-10 pb-20">
      <header className="flex flex-col gap-3">
        <p className="w-fit rounded-pill bg-ink px-3 py-1 text-xs font-semibold text-paper">개발 서버에서만 보이는 화면</p>
        <h1 className="font-display text-4xl leading-tight text-ink">둘러보기</h1>
        <p className="max-w-prose leading-relaxed text-ink-soft">
          단계별 샘플 이벤트가 들어 있어요. 이름을 누르면 PIN 없이 그 사람으로 바로 들어갑니다. 원래는 아무도 볼 수
          없는 배정표도 여기에서는 보여 주니, 누구의 내 임무에서 판정 버튼이 보이는지 확인할 수 있어요.
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-card border border-line bg-card px-5 py-4 text-sm">
          <div>
            <dt className="text-ink-soft">샘플 참가자 PIN</dt>
            <dd className="font-display text-xl text-ink">{DEMO_PIN}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">관리 비밀번호 (이벤트 만들기)</dt>
            <dd className="font-display text-xl text-ink">{process.env.ADMIN_PASSWORD === DEV_ADMIN_PASSWORD ? DEV_ADMIN_PASSWORD : ".env의 ADMIN_PASSWORD"}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">처음 상태로 되돌리기</dt>
            <dd className="font-display text-xl text-ink">yarn dev:reset</dd>
          </div>
        </dl>
      </header>

      {events.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-ink-soft">
          이벤트가 없어요. <code>yarn dev:reset</code> 후 개발 서버를 다시 켜면 샘플이 만들어져요.
        </p>
      ) : (
        events.map((event) => <EventSection key={event.id} event={event} />)
      )}

      <Link href="/new" className="w-fit font-semibold text-berry-deep underline underline-offset-4">
        새 이벤트를 직접 만들어 보기
      </Link>
    </main>
  );
}

function EventSection({ event }: { event: DevEvent }) {
  const stage = STAGE[event.status];
  const assigned = event.members.some((m) => m.targetName);
  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-card p-5 shadow-lift">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-sun px-3 py-0.5 text-sm font-semibold text-sun-ink">{stage.label}</span>
          <h2 className="font-display text-2xl text-ink">{event.name}</h2>
        </div>
        <p className="text-sm text-ink-soft">
          {stage.summary} {formatKst(event.startsAt)} ~ {formatKst(event.endsAt)}
        </p>
        <Link href={`/e/${event.code}`} className="w-fit text-sm font-semibold text-berry-deep underline underline-offset-4">
          초대 링크 /e/{event.code}
        </Link>
      </header>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">
          이 사람으로 들어가기{assigned && " (화살표는 그 사람이 몰래 챙기는 대상)"}
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {event.members.map((m) => (
            <li key={m.id}>
              <form action={devEnterAction}>
                <input type="hidden" name="code" value={event.code} />
                <input type="hidden" name="participantId" value={m.id} />
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-field bg-berry-tint px-4 text-left font-semibold text-berry-deep active:bg-paper-deep"
                >
                  <span>
                    {m.name}
                    {m.isOrganizer && <span className="ml-2 text-xs font-medium text-ink-soft">개설자</span>}
                  </span>
                  {m.targetName && <span className="text-sm font-medium text-ink-soft">→ {m.targetName}</span>}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">확인해 볼 것</h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink">
          {stage.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
