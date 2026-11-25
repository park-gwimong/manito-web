import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_MISSIONS } from "@/domain/default-missions";
import { toKstInput } from "@/lib/format";
import { Screen } from "../_components/ui";
import { CreateEventForm } from "./CreateEventForm";

export const metadata: Metadata = { title: "이벤트 만들기" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 기본 일정: 내일 오전 9시(KST)부터 일주일. */
function defaultSchedule(now: Date) {
  const tomorrow = toKstInput(new Date(now.getTime() + DAY_MS)).slice(0, 10);
  const nextWeek = toKstInput(new Date(now.getTime() + 8 * DAY_MS)).slice(0, 10);
  return { startsAt: `${tomorrow}T09:00`, endsAt: `${nextWeek}T09:00` };
}

// 기본 일정이 오늘 날짜에 따라 달라지므로 요청마다 새로 그린다.
export const dynamic = "force-dynamic";

export default function NewEventPage() {
  const schedule = defaultSchedule(new Date());
  return (
    <Screen>
      <Link href="/" className="self-start text-sm text-ink-soft underline underline-offset-4">
        처음으로
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl text-ink">이벤트 만들기</h1>
        <p className="text-ink-soft">기간을 정하고 나면 초대 링크가 만들어져요. 시작 시각이 되면 마니또가 자동으로 정해져요. 일정은 시작 전까지 설정에서 바꿀 수 있어요.</p>
      </div>
      <CreateEventForm
        defaultStartsAt={schedule.startsAt}
        defaultEndsAt={schedule.endsAt}
        maxMissions={DEFAULT_MISSIONS.length}
      />
    </Screen>
  );
}
