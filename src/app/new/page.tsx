import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "../_components/ui";
import { CreateEventForm } from "./CreateEventForm";

export const metadata: Metadata = { title: "이벤트 만들기" };

export default function NewEventPage() {
  return (
    <Screen>
      <Link href="/" className="self-start text-sm text-ink-soft underline underline-offset-4">
        처음으로
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl text-ink">이벤트 만들기</h1>
        <p className="text-ink-soft">기간을 정하고 나면 초대 링크가 만들어져요. 시작 시각이 되면 마니또가 자동으로 정해져요.</p>
      </div>
      <CreateEventForm />
    </Screen>
  );
}
