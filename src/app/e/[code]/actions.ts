"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { updateEventSettings } from "@/domain/events";
import { addTemplate, completeMission, deleteTemplate, updateTemplate } from "@/domain/missions";
import {
  acknowledgePinReset,
  joinEvent,
  loginWithPin,
  removeParticipant,
  resetOrganizerPin,
  resetPin,
  setNewPin,
} from "@/domain/participants";
import {
  addSecretDeed,
  createRecord,
  deleteRecord,
  deleteSecretDeed,
  setVerdict,
  toggleReaction,
  updateRecord,
} from "@/domain/records";
import { finishPresentation, setGuess, startPresentation } from "@/domain/reveal";
import { DomainError } from "@/domain/errors";
import { runAction, str, type ActionResult } from "@/lib/action";
import { parseKstInput } from "@/lib/format";
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

// ---- 진행 화면 (기록, 반응, 판정, 임무) ----

export async function createRecordAction(code: string, body: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await createRecord(getDb(), me.id, str(body), new Date());
  });
}

export async function updateRecordAction(code: string, recordId: string, body: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await updateRecord(getDb(), me.id, str(recordId), str(body), new Date());
  });
}

export async function deleteRecordAction(code: string, recordId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await deleteRecord(getDb(), me.id, str(recordId), new Date());
  });
}

export async function toggleReactionAction(code: string, recordId: string, emoji: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await toggleReaction(getDb(), me.id, str(recordId), str(emoji), new Date());
  });
}

export async function setVerdictAction(code: string, recordId: string, isMine: boolean): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    if (typeof isMine !== "boolean") throw new DomainError("INVALID_VERDICT", "판정 값이 올바르지 않아요.");
    await setVerdict(getDb(), me.id, str(recordId), isMine, new Date());
  });
}

export async function completeMissionAction(code: string, deliveryId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await completeMission(getDb(), me.id, str(deliveryId), new Date());
  });
}

export async function addSecretDeedAction(code: string, body: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await addSecretDeed(getDb(), me.id, str(body), new Date());
  });
}

export async function deleteSecretDeedAction(code: string, deedId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await deleteSecretDeed(getDb(), me.id, str(deedId), new Date());
  });
}

// ---- 설정, 마감, 발표 (개설자 권한은 도메인 함수가 다시 확인한다) ----

function requireDate(value: string, label: string): Date {
  const d = parseKstInput(value);
  if (!d) throw new DomainError("INVALID_DATE", `${label}를 입력해 주세요.`);
  return d;
}

export async function updateSettingsAction(code: string, formData: FormData): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    const missionRaw = str(formData.get("missionCount")).trim();
    await updateEventSettings(
      getDb(),
      me.id,
      {
        name: str(formData.get("name")),
        startsAt: requireDate(str(formData.get("startsAt")), "시작 일시"),
        endsAt: requireDate(str(formData.get("endsAt")), "종료 일시"),
        missionCount: missionRaw === "" ? Number.NaN : Number(missionRaw),
      },
      new Date(),
    );
  });
}

export async function addTemplateAction(code: string, body: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await addTemplate(getDb(), me.id, str(body), new Date());
  });
}

export async function updateTemplateAction(code: string, templateId: string, body: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await updateTemplate(getDb(), me.id, str(templateId), str(body), new Date());
  });
}

export async function deleteTemplateAction(code: string, templateId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await deleteTemplate(getDb(), me.id, str(templateId), new Date());
  });
}

export async function removeParticipantAction(code: string, targetId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await removeParticipant(getDb(), me.id, str(targetId));
  });
}

export async function resetPinAction(code: string, targetId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await resetPin(getDb(), me.id, str(targetId), new Date());
  });
}

/** 로그인 화면에서 쓰므로 세션 없이 동작한다. 관리 비밀번호가 곧 자격이다. */
export async function resetOrganizerPinAction(code: string, adminPassword: string): Promise<ActionResult> {
  return act(async () => {
    const event = await requireEvent(str(code));
    await resetOrganizerPin(getDb(), event.id, str(adminPassword), new Date());
  });
}

export async function setGuessAction(code: string, guessedId: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await setGuess(getDb(), me.id, str(guessedId), new Date());
  });
}

export async function startPresentationAction(code: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await startPresentation(getDb(), me.id, new Date());
  });
}

export async function finishPresentationAction(code: string): Promise<ActionResult> {
  return act(async () => {
    const { me } = await requireMe(str(code));
    await finishPresentation(getDb(), me.id, new Date());
  });
}
