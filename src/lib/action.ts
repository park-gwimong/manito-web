import { unstable_rethrow } from "next/navigation";
import { DomainError } from "@/domain/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "잠시 후 다시 시도해 주세요.";

/**
 * Server Action 본문을 감싼다. DomainError는 사용자에게 보여줄 메시지로,
 * 그 밖의 오류는 서버 로그에 남기고 일반 안내로 바꾼다.
 */
export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    // redirect()/notFound() 같은 Next.js 제어 흐름은 그대로 올려 보낸다.
    unstable_rethrow(e);
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error("[action] unexpected error", e);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Server Action 인자는 직접 POST로도 들어오므로 문자열이 아니면 빈 문자열로 취급한다. */
export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
