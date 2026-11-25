"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { assertDev } from "@/dev/overview";
import { getEventByCode } from "@/domain/events";
import { getMember } from "@/domain/participants";
import { str } from "@/lib/action";
import { setSession } from "@/lib/viewer";

/**
 * 개발 전용: PIN 없이 그 참가자로 들어간다. 여러 사람의 화면을 번갈아 확인하기 위한 것.
 * 운영에서는 `assertDev()`가 막는다.
 */
export async function devEnterAction(formData: FormData): Promise<void> {
  assertDev();
  const code = str(formData.get("code"));
  const to = str(formData.get("to"));
  const event = await getEventByCode(getDb(), code);
  const member = event ? await getMember(getDb(), event.id, str(formData.get("participantId"))) : null;
  if (!event || !member) throw new Error("참가자를 찾을 수 없어요.");
  await setSession(event.code, member);
  redirect(`/e/${event.code}${to === "settings" || to === "duty" || to === "rank" || to === "result" ? `/${to}` : ""}`);
}
