"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { acknowledgePinReset, joinEvent, loginWithPin, setNewPin } from "@/domain/participants";
import { runAction, str, type ActionResult } from "@/lib/action";
import { requireEvent, requireMe, requireMember, setSession } from "@/lib/viewer";

/** 성공했을 때만 이벤트 화면 전체를 다시 그린다. */
async function act(fn: () => Promise<void>): Promise<ActionResult> {
  const result = await runAction(fn);
  if (result.ok) revalidatePath("/e/[code]", "layout");
  return result;
}

export async function joinAction(code: string, name: string, pin: string): Promise<ActionResult> {
  return act(async () => {
    const event = await requireEvent(str(code));
    const me = await joinEvent(getDb(), event.id, { name: str(name), pin: str(pin) }, new Date());
    await setSession(event.code, me);
  });
}

export async function loginAction(code: string, participantId: string, pin: string): Promise<ActionResult> {
  return act(async () => {
    const event = await requireEvent(str(code));
    const member = await requireMember(event, str(participantId));
    const me = await loginWithPin(getDb(), member.id, str(pin), new Date());
    await setSession(event.code, me);
  });
}

/** PIN이 초기화된 참가자용이라 세션 없이 동작한다. 도메인이 pinHash가 비어 있을 때만 허용한다. */
export async function setNewPinAction(code: string, participantId: string, pin: string): Promise<ActionResult> {
  return act(async () => {
    const event = await requireEvent(str(code));
    const member = await requireMember(event, str(participantId));
    const me = await setNewPin(getDb(), member.id, str(pin), new Date());
    await setSession(event.code, me);
  });
}

export async function ackPinResetAction(code: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await acknowledgePinReset(getDb(), me.id);
  });
}
