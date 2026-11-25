"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { DomainError } from "@/domain/errors";
import { createEvent } from "@/domain/events";
import { DEFAULT_MISSION_HOUR, type MissionMode } from "@/domain/mission-plan";
import { verifyAdminPassword } from "@/domain/participants";
import { runAction, str, type ActionResult } from "@/lib/action";
import { parseKstInput } from "@/lib/format";
import { setSession } from "@/lib/viewer";

function requireDate(value: string, label: string): Date {
  const d = parseKstInput(value);
  if (!d) throw new DomainError("INVALID_DATE", `${label}를 입력해 주세요.`);
  return d;
}

/** 관리 비밀번호 확인 → 이벤트 개설 → 개설자 세션 → 이벤트 화면으로 이동. 실패하면 오류를 돌려준다. */
export async function createEventAction(formData: FormData): Promise<ActionResult> {
  let code = "";
  const result = await runAction(async () => {
    if (!verifyAdminPassword(str(formData.get("adminPassword")))) {
      throw new DomainError("WRONG_ADMIN_PASSWORD", "관리 비밀번호가 맞지 않아요.");
    }
    const missionRaw = str(formData.get("missionCount")).trim();
    const { event, organizer } = await createEvent(
      getDb(),
      {
        name: str(formData.get("name")),
        // datetime-local 값은 KST 벽시계 시각이다.
        startsAt: requireDate(str(formData.get("startsAt")), "시작 일시"),
        endsAt: requireDate(str(formData.get("endsAt")), "종료 일시"),
        missionCount: missionRaw === "" ? Number.NaN : Number(missionRaw),
        missionMode: str(formData.get("missionMode")) as MissionMode,
        // custom에서는 도착 시각 칸이 없으므로 기본값을 쓴다.
        missionHour: formData.get("missionHour") === null ? DEFAULT_MISSION_HOUR : Number(str(formData.get("missionHour"))),
        organizerName: str(formData.get("organizerName")),
        organizerPin: str(formData.get("organizerPin")),
      },
      new Date(),
    );
    await setSession(event.code, organizer);
    code = event.code;
  });
  if (!result.ok) return result;
  redirect(`/e/${code}`);
}
