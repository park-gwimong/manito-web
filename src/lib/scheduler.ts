import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { refreshDemoEvents } from "@/dev/demo-seed";
import { demoEnabled, isDev } from "@/dev/overview";
import { advanceEvent } from "@/domain/lifecycle";
import { flushNotifications } from "./push";

const INTERVAL_MS = 60_000;
const holder = globalThis as typeof globalThis & { __manitoScheduler?: ReturnType<typeof setInterval> };

/**
 * 한 번의 점검: 시작·마감 시각이 지났거나 미션을 보낼 때가 된 이벤트를 진행시키고, 쌓인 알림을 보낸다.
 * 아무도 접속하지 않아도 단계가 제때 넘어가게 하기 위한 것이다.
 */
export async function tick(now: Date = new Date()): Promise<void> {
  const db = getDb();
  // 운영에서 둘러보기를 켰으면 샘플을 하루에 한 번 새로 만든다. (개발 서버는 처음 켤 때 한 번만 넣는다)
  if (demoEnabled() && !isDev()) {
    try {
      if (await refreshDemoEvents(db, now)) console.log("[scheduler] 둘러보기용 샘플 이벤트를 새로 만들었어요.");
    } catch (e) {
      console.error("[scheduler] 샘플 이벤트를 만들지 못했어요.", e);
    }
  }
  const due = await db
    .select({ id: events.id })
    .from(events)
    .where(
      or(
        eq(events.status, "active"),
        and(eq(events.status, "preparing"), lte(events.startsAt, now), isNull(events.startMissedAt)),
      ),
    );
  for (const event of due) {
    try {
      await advanceEvent(db, event.id, now);
    } catch (e) {
      console.error("[scheduler] 이벤트를 진행시키지 못했어요.", event.id, e);
    }
  }
  await flushNotifications(db);
}

/** 서버가 뜰 때 한 번 부른다. 1분마다 `tick`을 돌린다. 여러 번 불러도 타이머는 하나다. */
export function startScheduler(): void {
  if (holder.__manitoScheduler) return;
  // 뜨자마자 한 번 돌려, 밀린 단계 전환과 샘플 준비를 1분 기다리지 않게 한다.
  tick().catch((e) => console.error("[scheduler] 첫 점검에 실패했어요.", e));
  const timer = setInterval(() => {
    tick().catch((e) => console.error("[scheduler] 점검에 실패했어요.", e));
  }, INTERVAL_MS);
  timer.unref?.();
  holder.__manitoScheduler = timer;
}
