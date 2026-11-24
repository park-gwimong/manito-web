import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatKst } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { PinResetNotice } from "./_components/PinResetNotice";
import { TabBar } from "./_components/TabBar";

export async function generateMetadata({ params }: LayoutProps<"/e/[code]">): Promise<Metadata> {
  const viewer = await getViewer((await params).code);
  return { title: viewer?.event.name ?? "이벤트를 찾을 수 없어요" };
}

export default async function EventLayout({ children, params }: LayoutProps<"/e/[code]">) {
  const viewer = await getViewer((await params).code);
  if (!viewer) notFound();
  const { event, me } = viewer;

  return (
    <>
      {me?.pinResetAt && <PinResetNotice code={event.code} resetAtLabel={formatKst(me.pinResetAt)} />}
      {children}
      {me && event.status !== "preparing" && <TabBar code={event.code} isOrganizer={me.isOrganizer} />}
    </>
  );
}
