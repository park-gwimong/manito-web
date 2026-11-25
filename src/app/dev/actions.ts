"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { isTourable } from "@/dev/overview";
import { getEventByCode } from "@/domain/events";
import { getMember } from "@/domain/participants";
import { str } from "@/lib/action";
import { setSession } from "@/lib/viewer";

/**
 * 둘러보기 전용: PIN 없이 그 참가자로 들어간다. 여러 사람의 화면을 번갈아 확인하기 위한 것.
 * 개발 서버에서는 모든 이벤트에, 운영에서는 `DEMO_MODE=1`일 때 샘플 이벤트에만 쓸 수 있다.
 * 실제 이벤트는 여기서 막는다.
 */
export async function devEnterAction(formData: FormData): Promise<void> {
  const code = str(formData.get("code"));
  const to = str(formData.get("to"));
  const event = await getEventByCode(getDb(), code);
  if (!event || !isTourable(event)) throw new Error("둘러보기로 들어갈 수 없는 이벤트예요.");
  const member = await getMember(getDb(), event.id, str(formData.get("participantId")));
  if (!member) throw new Error("참가자를 찾을 수 없어요.");
  await setSession(event.code, member);
  redirect(`/e/${event.code}${to === "settings" || to === "duty" || to === "rank" || to === "result" ? `/${to}` : ""}`);
}
