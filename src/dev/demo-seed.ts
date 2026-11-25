/**
 * 샘플 이벤트 만들기. `yarn seed:demo`와 개발 서버 시작(`src/dev/bootstrap.ts`)이 함께 쓴다.
 *
 * 6명짜리 이벤트를 만들고 요청한 단계까지 도메인 함수로 진행시킨다.
 * 과거 시각을 `now`로 넘겨 시간이 흐른 것처럼 만들기 때문에, 쓰는 코드는 실제 서비스와 같다.
 */
import { asc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { events, type Event, type Participant } from "../db/schema";
import { createEvent } from "../domain/events";
import { advanceEvent, getGiverIdOf } from "../domain/lifecycle";
import { completeMission } from "../domain/missions";
import { joinEvent } from "../domain/participants";
import { addSecretDeed, createRecord, setVerdict, toggleReaction } from "../domain/records";
import { finishPresentation, setGuess, startPresentation } from "../domain/reveal";
import { getDuty } from "../domain/views";

export const DEMO_STAGES = ["preparing", "active", "closed", "revealed"] as const;
export type DemoStage = (typeof DEMO_STAGES)[number];

export const DEMO_PIN = "0000";
export const DEMO_NAMES = ["민지", "준호", "서연", "도윤", "하은", "지우"]; // 첫 번째가 개설자

const EVENT_NAMES: Record<DemoStage, string> = {
  preparing: "샘플: 신년 워크숍 마니또",
  active: "샘플: 연말 마니또",
  closed: "샘플: 가을 소풍 마니또",
  revealed: "샘플: 여름 MT 마니또",
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const RECORD_BODIES = [
  "책상 위에 누가 따뜻한 커피를 두고 갔어요. 누구세요? ☕",
  "오늘 아침 엘리베이터 버튼을 대신 눌러 준 분이 계셨어요.",
  "점심시간에 제 몫의 간식이 몰래 놓여 있었어요 🍪",
  "비 오는 날 우산을 빌려 주신 분, 감사합니다!",
  "노트북 충전기를 슬쩍 챙겨 주신 것 같아요.",
  "퇴근길에 응원 쪽지가 붙어 있었어요. 힘이 났어요.",
  "회의실 예약을 누가 대신 해 뒀더라고요. 마니또일까요?",
  "자리에 핫팩이 올려져 있었어요. 손이 다 녹았어요 🔥",
];
const DEED_BODIES = [
  "책상에 따뜻한 커피를 올려 두었다.",
  "엘리베이터 문을 잡아 주었다.",
  "간식을 몰래 서랍에 넣어 두었다.",
  "응원 쪽지를 적어 붙였다.",
  "무거운 짐을 같이 들어 주었다.",
];
const EMOJIS = ["👍", "❤️", "😂", "😮", "🥹"];

export async function seedDemo(db: Db, stage: DemoStage): Promise<{ event: Event; members: Participant[] }> {
  const real = Date.now();
  const at = (ms: number) => new Date(ms);

  // 단계별 일정. preparing은 아직 시작 전, 나머지는 과거에 시작했다.
  const schedule =
    stage === "preparing"
      ? { startsAt: real + DAY, endsAt: real + 4 * DAY }
      : stage === "active"
        ? { startsAt: real - 3 * DAY, endsAt: real + 4 * DAY }
        : { startsAt: real - 8 * DAY, endsAt: real - DAY };
  const createdAt = stage === "preparing" ? real : schedule.startsAt - 2 * HOUR;

  const { event, organizer } = await createEvent(
    db,
    {
      name: EVENT_NAMES[stage],
      startsAt: at(schedule.startsAt),
      endsAt: at(schedule.endsAt),
      missionCount: 3,
      organizerName: DEMO_NAMES[0],
      organizerPin: DEMO_PIN,
    },
    at(createdAt),
  );
  // 샘플 표시. 둘러보기 화면이 운영에서 이 표시가 있는 이벤트만 다룬다.
  const seededAt = at(real);
  await db.update(events).set({ demoSeededAt: seededAt }).where(eq(events.id, event.id));
  event.demoSeededAt = seededAt;

  const members = [organizer];
  for (const [i, name] of DEMO_NAMES.slice(1).entries()) {
    members.push(await joinEvent(db, event.id, { name, pin: DEMO_PIN }, at(createdAt + (i + 1) * 10 * MIN)));
  }

  if (stage !== "preparing") {
    // 시작 시각이 지난 뒤 처음 불러 배정과 첫 미션을 만든다.
    await advanceEvent(db, event.id, at(schedule.startsAt + MIN));

    const limit = Math.min(schedule.endsAt, real) - HOUR; // 활동은 이 시각 전까지만
    const days = Math.floor((limit - schedule.startsAt) / DAY);
    const records: { id: string; authorId: string; at: number }[] = [];

    for (let d = 0; d <= days; d++) {
      for (const [i, author] of members.entries()) {
        const t = schedule.startsAt + d * DAY + (9 + i) * HOUR;
        if (t > limit || (d + i) % 4 === 3) continue; // 하루씩 건너뛰는 사람도 있게
        const body = RECORD_BODIES[(d * 3 + i) % RECORD_BODIES.length];
        const { id } = await createRecord(db, author.id, body, at(t));
        records.push({ id, authorId: author.id, at: t });
      }
      for (const [i, giver] of members.entries()) {
        const t = schedule.startsAt + d * DAY + (14 + (i % 3)) * HOUR;
        if (t > limit || (d + i) % 3 === 2) continue;
        await addSecretDeed(db, giver.id, DEED_BODIES[(d + i) % DEED_BODIES.length], at(t));
      }
    }

    for (const [n, rec] of records.entries()) {
      // 다른 사람들의 반응
      const others = members.filter((m) => m.id !== rec.authorId);
      for (const k of [0, 1]) {
        const reactor = others[(n + k) % others.length];
        await toggleReaction(db, reactor.id, rec.id, EMOJIS[(n + k) % EMOJIS.length], at(rec.at + (k + 1) * 20 * MIN));
      }
      // 마니또의 판정: 하루가 지난 기록만. 대부분 "내가 한 일"이고 일부는 아니라고 답한다.
      if (rec.at + DAY <= limit) {
        const judgeId = await getGiverIdOf(db, rec.authorId);
        if (judgeId) await setVerdict(db, judgeId, rec.id, n % 4 !== 3, at(rec.at + 3 * HOUR));
      }
    }

    // 도착한 미션 중 일부를 완료한다.
    await advanceEvent(db, event.id, at(limit));
    for (const [i, m] of members.entries()) {
      const duty = await getDuty(db, event.id, m.id);
      for (const [k, mission] of (duty?.missions ?? []).entries()) {
        if ((i + k) % 3 === 2) continue;
        await completeMission(db, m.id, mission.id, at(Math.min(mission.deliveredAt.getTime() + 3 * HOUR, limit)));
      }
    }

    if (stage === "closed" || stage === "revealed") {
      const closedAt = schedule.endsAt + MIN;
      const closed = await advanceEvent(db, event.id, at(closedAt));
      if (closed.status !== "closed") throw new Error(`마감 처리 실패: ${closed.status}`);

      // 마니또 추측: 절반 정도만 맞힌다.
      for (const [i, m] of members.entries()) {
        const giverId = await getGiverIdOf(db, m.id);
        const wrong = members.find((x) => x.id !== m.id && x.id !== giverId)!;
        const guessedId = i % 2 === 0 && giverId ? giverId : wrong.id;
        await setGuess(db, m.id, guessedId, at(closedAt + (i + 1) * 5 * MIN));
      }

      if (stage === "revealed") {
        await startPresentation(db, organizer.id, at(closedAt + 3 * HOUR));
        await finishPresentation(db, organizer.id, at(closedAt + 4 * HOUR));
      }
    }
  }

  return { event, members };
}

/** 샘플을 새로 만드는 주기. 며칠 지나면 단계가 저절로 넘어가므로 하루에 한 번 처음 상태로 되돌린다. */
export const DEMO_REFRESH_MS = DAY;

let refreshing = false;

/**
 * 운영의 둘러보기용(`DEMO_MODE=1`). 샘플이 없거나 만든 지 하루가 지났으면 지우고 단계별로 다시 만든다.
 * 샘플 표시가 있는 이벤트만 지운다. 실제 이벤트는 건드리지 않는다.
 * 새로 만들었으면 true.
 */
export async function refreshDemoEvents(db: Db, now: Date = new Date()): Promise<boolean> {
  if (refreshing) return false;
  refreshing = true;
  try {
    const demos = await db
      .select({ seededAt: events.demoSeededAt })
      .from(events)
      .where(isNotNull(events.demoSeededAt))
      .orderBy(asc(events.demoSeededAt));
    const oldest = demos[0]?.seededAt;
    const fresh = demos.length >= DEMO_STAGES.length && oldest && now.getTime() - oldest.getTime() < DEMO_REFRESH_MS;
    if (fresh) return false;

    await db.delete(events).where(isNotNull(events.demoSeededAt));
    for (const stage of DEMO_STAGES) await seedDemo(db, stage);
    return true;
  } finally {
    refreshing = false;
  }
}
