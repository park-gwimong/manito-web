import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getDutyBadge, getHeader } from "@/domain/views";
import { formatKst } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { EventShell } from "./_components/EventShell";
import { PinResetNotice } from "./_components/PinResetNotice";

export async function generateMetadata({ params }: LayoutProps<"/e/[code]">): Promise<Metadata> {
  const viewer = await getViewer((await params).code);
  return { title: viewer?.event.name ?? "이벤트를 찾을 수 없어요" };
}

export default async function EventLayout({ children, params }: LayoutProps<"/e/[code]">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;
  // 입장했고 이벤트가 시작된 뒤에만 메뉴와 온도계가 있는 틀을 씌운다.
  const header = me && event.status !== "preparing" ? await getHeader(getDb(), event, new Date()) : null;
  // 진행 중에만: 내 임무 메뉴에 아직 하지 않은 일의 개수를 붙인다.
  const dutyBadge = me && event.status === "active" ? await getDutyBadge(getDb(), event.id, me.id) : 0;

  return (
    <>
      {me?.pinResetAt && <PinResetNotice code={event.code} resetAtLabel={formatKst(me.pinResetAt)} />}
      {me && header ? (
        <EventShell
          code={event.code}
          eventName={event.name}
          myName={me.name}
          isOrganizer={me.isOrganizer}
          temperature={header.temperature}
          dday={header.dday}
          dutyBadge={dutyBadge}
        >
          {children}
        </EventShell>
      ) : (
        children
      )}
    </>
  );
}
