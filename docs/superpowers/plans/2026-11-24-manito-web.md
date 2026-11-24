# 마니또 웹 서비스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5~10명 모임이 기간을 정해 마니또를 진행하고, 기록·판정·미션·포인트·모임 온도를 거쳐 종료 때 함께 결과를 발표하는 웹 서비스를 만든다.

**Architecture:** Next.js 단일 앱. 규칙은 전부 `src/domain/`의 함수(`db`와 `now`를 인자로 받음)에 두고 PGlite로 테스트한다. 화면은 서버 컴포넌트가 `src/domain/views.ts`의 "보는 사람 기준" 조회 함수만 호출하고, 쓰기는 Server Action이 도메인 함수를 감싼다. 시간 전환(시작·미션 배달·마감)은 모든 요청의 맨 앞에서 `advanceEvent`가 처리한다.

**Tech Stack:** Next.js(App Router, 최신 안정판) · TypeScript · Tailwind CSS · PostgreSQL 16 · Drizzle ORM(`drizzle-orm`, `drizzle-kit`, `pg`) · 테스트 Vitest + `@electric-sql/pglite` · `jose`(세션 서명) · `bcryptjs`(PIN 해시) · yarn · Docker Compose

**Spec:** `docs/superpowers/specs/2026-11-24-manito-design.md` (실행자는 이 문서도 함께 읽는다)

> **실행 결과 (2026-11-24):** 12개 작업과 최종 검토를 마쳤다. 실행 중 아래 항목이 이 계획과 다르게 구현되었고, 설계 문서(Spec)에 반영되어 있다. 차이가 있으면 설계 문서가 기준이다.
> - PIN 잠금: 5분 고정이 아니라 5분부터 두 배씩 늘어 최대 24시간 (`PIN_LOCK_MAX_MINUTES = 1440`).
> - PIN 초기화: `participants.lastPinResetAt` 컬럼 추가(마이그레이션 `0001`). 초기화 이전 세션은 무효가 되고, 참가자 홈에 지워지지 않는 초기화 문구가 남는다.
> - `reveal.ts`에 `countUnguessed(db, eventId)` 추가, 설정 화면에 미추측 인원 표시.
> - 발표 슬라이드 컴포넌트 파일명은 `Slides.tsx`가 아니라 `SlideDeck.tsx` (`slides.ts`와 대소문자 충돌 회피).
> - `next.config.ts`에서 `cacheComponents`, `partialPrefetching` 제거. vitest 제한 시간 20초.
> - 마감 단계에서도 30초 간격 자동 새로고침. 앱 포트는 `127.0.0.1`에만 공개.
> - `src/lib/viewer.ts`의 참가자 조회는 `src/domain/participants.ts`의 `getMember`, `listLoginCandidates`로 옮겼다.

## Global Constraints

- **비밀 정보:** 배정, 판정 값, 몰래 한 일, 남의 미션은 `src/domain/` 밖으로 나갈 때 "요청한 사람이 볼 자격이 있는 것"만 담는다. 클라이언트 컴포넌트 props에 전체 데이터를 넘기고 화면에서 숨기는 방식은 금지.
- 페이지·Server Action은 `src/db/schema.ts` 테이블을 직접 조회하지 않는다. 반드시 `src/domain/` 함수를 거친다.
- 모든 요청은 다른 일을 하기 전에 `advanceEvent(db, eventId, now)`를 먼저 호출한다.
- 도메인 함수는 현재 시각을 `now: Date` 인자로 받는다. 내부에서 `new Date()` 금지.
- 시간대는 Asia/Seoul 고정. 화면의 날짜·시각 표시와 "하루" 계산 모두 KST.
- 화면 문구와 오류 메시지는 한국어. 모바일 우선(발표 화면만 큰 화면 기준).
- 최소 인원 4명. PIN은 숫자 4자리, 해시 저장.
- 점수 기본값: 기록 +10(KST 하루 3건까지), 미션 완료 +10, 적중 +20, 인정받은 선행 +20, 판정 참여 +5, 몰래 한 일 +5, 추측 정답 +50. 실시간 포인트에는 앞의 두 가지만 들어간다.
- 모임 온도는 36.5℃에서 시작, 상한 100℃.
- 발표·순위 화면에 등수 숫자, "꼴찌" 등 지목형 표현을 쓰지 않는다.
- 규칙 위반은 `DomainError(code, message)`로 던지고, `message`는 사용자에게 그대로 보여줄 한국어 문장.
- 개발 서버(`yarn dev`)는 실행자가 띄우지 않는다. 화면 확인이 필요하면 사용자에게 요청한다. 검증은 `yarn test`, `yarn tsc --noEmit`, `yarn build`로 한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

스펙이 암시하지만 놓치기 쉬운 경우. 각 항목의 테스트는 표시된 Task에 들어 있다.

1. **응답 데이터로 새는 비밀** — 마니또가 아닌 사람의 피드 항목에 판정 값이나 판정 가능 여부가 들어 있으면 안 된다. 작성자 본인에게도 안 된다. (Task 7)
2. **한참 뒤에 처리되는 시간 전환** — 며칠간 아무도 접속하지 않다가 종료 후에 첫 요청이 와도, 밀린 미션은 전부 배달되고 이벤트는 마감되며 그 요청의 기록 작성은 거부된다. (Task 4, 5)
3. **겹치는 전환 처리** — `advanceEvent`가 같은 시각에 두 번 불려도 배정은 한 벌, 미션 배달은 슬롯당 한 건이다. (Task 3, 4)
4. **시작 시각 전후의 입장** — 시작 일시가 지난 뒤 4번째 사람이 입장해도 자동 시작하지 않는다. 공백·중복 이름은 거부한다. (Task 2, 3)
5. **판정된 기록의 삭제와 PIN 무차별 대입** — 판정이 달린 기록을 작성자가 지우면 판정·반응도 함께 사라지고 점수가 맞게 줄어든다. PIN을 5번 틀리면 5분간 잠긴다. (Task 5, 2)

---

## File Structure

```
src/
  db/
    schema.ts            테이블 정의
    client.ts            운영용 DB 연결(pg), Db 타입
    test-db.ts           테스트용 PGlite DB 생성
  domain/
    constants.ts         점수·인원·온도 상수, 허용 이모지
    errors.ts            DomainError
    default-missions.ts  기본 미션 30개
    events.ts            개설, 설정 변경, 조회
    participants.ts      입장, PIN 로그인·초기화, 삭제
    lifecycle.ts         배정 고리, advanceEvent
    missions.ts          미션 목록 관리, 배달, 완료
    records.ts           기록, 반응, 판정, 몰래 한 일
    scoring.ts           실시간 포인트, 최종 점수, 온도
    views.ts             보는 사람 기준 조회(로비·피드·내 임무·순위)
    reveal.ts            추측, 발표 시작·종료, 발표 데이터
  lib/
    session.ts           세션 토큰 서명·검증
    viewer.ts            쿠키 → 현재 참가자, advanceEvent 호출
    action.ts            Server Action 공통 래퍼
    format.ts            KST 날짜·D-day·온도 표시
  app/
    page.tsx                     소개 + 개설 링크
    new/                         이벤트 개설
    e/[code]/page.tsx            입장 / 로비 / 홈(피드)
    e/[code]/duty/page.tsx       내 임무
    e/[code]/rank/page.tsx       순위
    e/[code]/settings/page.tsx   개설자 설정
    e/[code]/present/page.tsx    발표(큰 화면)
    e/[code]/result/page.tsx     발표 후 결과
    e/[code]/actions.ts          Server Action 모음
    e/[code]/_components/        화면 조각
  instrumentation.ts     운영 시작 시 마이그레이션
drizzle/                 마이그레이션 SQL
scripts/seed-demo.ts     단계별 데모 이벤트 생성
Dockerfile, docker-compose.yml, .env.example, README.md
```

테스트는 대상 파일 옆에 `*.test.ts`로 둔다.

---

### Task 1: 프로젝트 뼈대, DB 스키마, 테스트 환경

**Files:**
- Create: 프로젝트 전체(create-next-app), `src/db/schema.ts`, `src/db/client.ts`, `src/db/test-db.ts`, `src/domain/constants.ts`, `src/domain/errors.ts`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces:
  - `type Db` (`src/db/client.ts`): 운영 pg 연결과 PGlite 양쪽에 맞는 Drizzle DB 타입(`PgDatabase<any, typeof schema>`). `getDb(): Db`는 `DATABASE_URL`로 연결한 싱글턴.
  - `createTestDb(): Promise<Db>` — 메모리 PGlite에 `drizzle/` 마이그레이션을 적용한 빈 DB.
  - `class DomainError extends Error { code: string }` — `new DomainError(code, message)`.
  - 상수(`constants.ts`): `MIN_PARTICIPANTS=4`, `RECORD_POINTS=10`, `RECORD_DAILY_CAP=3`, `MISSION_POINTS=10`, `HIT_BONUS=20`, `RECOGNIZED_BONUS=20`, `VERDICT_BONUS=5`, `SECRET_DEED_BONUS=5`, `GUESS_BONUS=50`, `BASE_TEMP=36.5`, `MAX_TEMP=100`, `REACTION_EMOJIS=['👍','❤️','😂','😮','🥹']`, `BODY_MAX=500`, `NAME_MAX=20`, `PIN_MAX_FAILS=5`, `PIN_LOCK_MINUTES=5`.
  - 테이블(모든 id는 uuid, 시각은 `timestamp with time zone`):

| 테이블 | 컬럼 |
|---|---|
| `events` | `id`, `code`(unique, 8자), `name`, `startsAt`, `endsAt`, `missionCount`, `status`('preparing'\|'active'\|'closed'\|'revealed'), `startMissedAt`(null 가능), `presentationStartedAt`(null 가능), `createdAt` |
| `participants` | `id`, `eventId`, `name`, `pinHash`(null 가능 = 초기화됨), `isOrganizer`, `pinResetAt`(null 가능), `failedPinAttempts`(기본 0), `pinLockedUntil`(null 가능), `createdAt`; unique(`eventId`,`name`) |
| `assignments` | `eventId`, `giverId`(unique), `receiverId`(unique) |
| `records` | `id`, `eventId`, `authorId`, `body`, `createdAt`, `updatedAt` |
| `verdicts` | `recordId`(PK, records 삭제 시 cascade), `isMine`, `decidedAt` |
| `reactions` | `recordId`(cascade), `participantId`, `emoji`; PK(세 컬럼) |
| `secretDeeds` | `id`, `eventId`, `giverId`, `body`, `createdAt` |
| `missionTemplates` | `id`, `eventId`, `body` |
| `missionDeliveries` | `id`, `eventId`, `participantId`, `body`, `slotIndex`, `deliveredAt`, `completedAt`(null 가능); unique(`participantId`,`slotIndex`) |
| `guesses` | `participantId`(PK), `guessedId` |

- [ ] **Step 1: 프로젝트 생성**

`yarn create next-app . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-yarn`
(폴더에 `docs/`가 있어 거부되면 임시 폴더에 만든 뒤 `.git`, `docs`를 제외하고 옮긴다.)
이어서 의존성 추가: `drizzle-orm pg jose bcryptjs`, 개발용 `drizzle-kit vitest @electric-sql/pglite @types/pg @types/bcryptjs tsx`.
`package.json` scripts에 `"test": "vitest run"`, `"db:generate": "drizzle-kit generate"` 추가. `next.config`에 `output: 'standalone'`.

- [ ] **Step 2: 실패하는 테스트 작성** (`src/db/schema.test.ts`)

```ts
test('빈 테스트 DB에 이벤트를 넣고 읽는다', async () => {
  const db = await createTestDb();
  await db.insert(events).values({ code: 'abcd1234', name: '연말', startsAt: new Date('2026-12-01T00:00:00+09:00'), endsAt: new Date('2026-12-24T00:00:00+09:00'), missionCount: 5 });
  const [row] = await db.select().from(events);
  expect(row.status).toBe('preparing');
  expect(row.startMissedAt).toBeNull();
});
test('같은 이벤트에 같은 이름은 DB에서 거부된다', async () => { /* participants 두 번 insert → rejects */ });
test('기록을 지우면 판정과 반응도 지워진다', async () => { /* records 삭제 후 verdicts, reactions 0건 */ });
```

- [ ] **Step 3: 실패 확인** — `yarn test src/db` → `createTestDb` 없음으로 FAIL

- [ ] **Step 4: 구현** — `schema.ts`(위 표), `yarn db:generate`로 `drizzle/` 생성, `client.ts`, `test-db.ts`(`drizzle-orm/pglite` + `drizzle-orm/pglite/migrator`), `constants.ts`, `errors.ts`, `.env.example`(`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`)

- [ ] **Step 5: 통과 확인** — `yarn test src/db` PASS, `yarn tsc --noEmit` 오류 없음

- [ ] **Step 6: Commit** — `chore: 프로젝트 뼈대와 DB 스키마`

---

### Task 2: 이벤트 개설, 입장, PIN

**Files:**
- Create: `src/domain/events.ts`, `src/domain/participants.ts`, `src/domain/default-missions.ts`, `src/lib/session.ts`
- Test: `src/domain/events.test.ts`, `src/domain/participants.test.ts`, `src/lib/session.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Db`, 테이블, 상수, `DomainError`
- Produces:
  - `DEFAULT_MISSIONS: string[]` — 정확히 30개. "대상에게 ~하기" 형태, 돈이 거의 들지 않고, 3분의 1 이상은 원격으로도 가능(예: "대상에게 응원 메시지를 익명으로 전하기", "대상의 장점 하나를 다른 사람 앞에서 칭찬하기", "대상 자리에 간식 하나 몰래 두기").
  - `verifyAdminPassword(input: string): boolean` — `process.env.ADMIN_PASSWORD`와 상수 시간 비교. 환경변수가 비어 있으면 항상 false.
  - `createEvent(db, input: { name: string; startsAt: Date; endsAt: Date; missionCount: number; organizerName: string; organizerPin: string }, now: Date): Promise<{ event: Event; organizer: Participant }>` — 무작위 8자 `code` 생성, `DEFAULT_MISSIONS`를 `missionTemplates`로 복사, 개설자를 참가자로 등록.
  - `validateSchedule(input: { startsAt: Date; endsAt: Date; missionCount: number }, templateCount: number, now: Date): void` — 위반 시 `DomainError`: `START_IN_PAST`(시작 ≤ now), `END_BEFORE_START`(종료 ≤ 시작), `BAD_MISSION_COUNT`(0 미만 또는 `templateCount` 초과).
  - `getEventByCode(db, code: string): Promise<Event | null>`
  - `updateEventSettings(db, organizerId: string, input: { name; startsAt; endsAt; missionCount }, now): Promise<Event>` — `preparing`에서만(`NOT_PREPARING`), 개설자만(`NOT_ORGANIZER`), `validateSchedule` 통과 시 저장하고 `startMissedAt`을 null로.
  - `joinEvent(db, eventId, input: { name: string; pin: string }, now): Promise<Participant>` — 이름은 앞뒤 공백 제거 후 1~20자(`INVALID_NAME`), PIN은 `/^\d{4}$/`(`INVALID_PIN`), 중복 이름 `NAME_TAKEN`, `preparing`이 아니면 `NOT_PREPARING`.
  - `loginWithPin(db, participantId, pin: string, now): Promise<Participant>` — 틀리면 `WRONG_PIN`과 `failedPinAttempts+1`, 5회째에 `pinLockedUntil = now+5분`. 잠긴 동안은 맞는 PIN도 `PIN_LOCKED`. 성공하면 횟수 0으로. `pinHash`가 null이면 `PIN_RESET_REQUIRED`.
  - `setNewPin(db, participantId, pin, now): Promise<Participant>` — `pinHash`가 null일 때만.
  - `resetPin(db, organizerId, targetId, now): Promise<void>` — `pinHash=null`, `pinResetAt=now`, 잠금 해제. 개설자만.
  - `resetOrganizerPin(db, eventId, adminPassword: string, now): Promise<void>` — 관리 비밀번호가 맞을 때 개설자에 대해 같은 처리. 틀리면 `WRONG_ADMIN_PASSWORD`.
  - `acknowledgePinReset(db, participantId): Promise<void>` — `pinResetAt=null`.
  - `removeParticipant(db, organizerId, targetId): Promise<void>` — `preparing`에서만, 개설자 자신은 불가(`CANNOT_REMOVE_ORGANIZER`).
  - `createSessionToken(payload: { participantId: string; eventId: string }): Promise<string>`, `readSessionToken(token: string): Promise<{ participantId: string; eventId: string } | null>` — `jose` HS256, `SESSION_SECRET`, 만료 90일. 변조·만료 토큰은 null.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// events.test.ts
test('개설하면 준비 상태, 개설자 1명, 미션 목록 30개', ...);
test('종료가 시작보다 이르면 END_BEFORE_START', ...);
test('시작이 과거면 START_IN_PAST', ...);
test('missionCount 31이면 BAD_MISSION_COUNT', ...);
test('설정을 바꾸면 startMissedAt이 지워진다', ...);
// participants.test.ts
test('이름 앞뒤 공백을 지우고 입장한다', ...);          // ' 지민 ' → '지민'
test('공백뿐인 이름은 INVALID_NAME', ...);
test("'지민'이 있으면 ' 지민'도 NAME_TAKEN", ...);
test('PIN이 12a4면 INVALID_PIN', ...);
test('PIN 5번 틀리면 6번째는 맞아도 PIN_LOCKED, 5분 뒤에는 통과', ...);
test('초기화하면 pinResetAt이 찍히고 기존 PIN으로 로그인 불가(PIN_RESET_REQUIRED)', ...);
test('개설자가 아닌 사람의 resetPin·removeParticipant는 NOT_ORGANIZER', ...);
test('관리 비밀번호가 틀리면 resetOrganizerPin은 WRONG_ADMIN_PASSWORD', ...);
// session.test.ts
test('토큰을 만들고 다시 읽는다', ...);
test('한 글자 바꾼 토큰은 null', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/events src/domain/participants src/lib/session` FAIL
- [ ] **Step 3: 구현** — 위 Interfaces대로
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: Commit** — `feat: 이벤트 개설, 입장, PIN`

---

### Task 3: 배정과 단계 전환

**Files:**
- Create: `src/domain/lifecycle.ts`
- Test: `src/domain/lifecycle.test.ts`

**Interfaces:**
- Consumes: Task 2의 `createEvent`, `joinEvent`
- Produces:
  - `buildChain(ids: string[], rng: () => number): { giverId: string; receiverId: string }[]` — `rng`로 섞은 뒤 i번째가 (i+1)번째에게, 마지막이 첫 번째에게 주는 하나의 고리.
  - `advanceEvent(db, eventId: string, now: Date, rng: () => number = Math.random): Promise<Event>` — 아래 순서로 처리하고 최신 이벤트를 돌려준다.
    1. `preparing`이고 `now ≥ startsAt`이고 `startMissedAt`이 null일 때: 참가자가 4명 이상이면 배정을 저장하고 `active`로, 미만이면 `startMissedAt = now`.
    2. `active`이고 `now ≥ endsAt`이면 `closed`로.
    - 1번에서 `active`가 된 뒤 같은 호출 안에서 2번까지 이어서 본다.
    - 상태 변경은 "현재 상태가 기대한 값일 때만 UPDATE … RETURNING"으로 하고, 변경된 행이 없으면 배정을 넣지 않는다(중복 호출 방지). 배정 저장과 상태 변경은 한 트랜잭션.
  - `getTargetOf(db, giverId): Promise<Participant | null>`, `getGiverIdOf(db, receiverId): Promise<string | null>` — 도메인 내부용. `views.ts`/`reveal.ts` 밖에서 쓰지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('buildChain: 5명이면 5쌍, 모두 한 번씩 주고받고, 자기 자신 없음, 고리 하나', () => {
  // giver를 따라 5번 이동하면 출발점, 그 전에는 돌아오지 않음
});
test('buildChain: 4명에서 서로 마니또인 쌍이 없다', ...);
test('시작 전에는 아무 일도 없다', ...);
test('4명이고 시작 시각이 되면 active, 배정 4건', ...);
test('3명이고 시작 시각이 지나면 preparing 유지, startMissedAt 기록', ...);
test('startMissedAt 이후 4번째가 입장해도 advanceEvent는 시작하지 않는다', ...);
test('개설자가 시작 일시를 다시 정하면 그 시각에 시작한다', ...);
test('advanceEvent를 두 번 불러도 배정은 4건', ...);
test('Promise.all로 동시에 두 번 불러도 배정은 4건', ...);
test('종료 시각이 지나면 closed', ...);
test('시작 전부터 종료 후까지 아무도 안 왔다가 한 번 부르면 closed이고 배정은 있다', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/lifecycle` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: Commit** — `feat: 마니또 배정과 단계 전환`

---

### Task 4: 미션

**Files:**
- Create: `src/domain/missions.ts`
- Modify: `src/domain/lifecycle.ts` (`advanceEvent`에서 배달 호출)
- Test: `src/domain/missions.test.ts`

**Interfaces:**
- Consumes: Task 3의 `advanceEvent`
- Produces:
  - `slotTime(event: { startsAt: Date; endsAt: Date; missionCount: number }, slotIndex: number): Date` — `startsAt + slotIndex × (endsAt − startsAt) / missionCount`. 0번 슬롯은 시작 시각.
  - `deliverDueMissions(db, event: Event, now: Date, rng: () => number): Promise<void>` — `slotTime ≤ now`인 슬롯 중 아직 배달되지 않은 것을 참가자마다 하나씩 넣는다. 본문은 그 참가자가 아직 받지 않은 템플릿 중 무작위. `deliveredAt`은 슬롯 시각. 충돌은 `onConflictDoNothing`.
  - `advanceEvent` 변경: 상태가 `active`이거나 이번 호출에서 `closed`로 넘어가는 경우, 마감 처리 **전에** `deliverDueMissions`를 부른다(종료 뒤에 처음 불려도 모든 슬롯이 배달됨).
  - `completeMission(db, participantId, deliveryId, now): Promise<void>` — 본인 것만(`NOT_YOURS`), `active`에서만(`NOT_ACTIVE`). 이미 완료면 그대로 둔다.
  - `addTemplate(db, organizerId, body, now)`, `updateTemplate(db, organizerId, templateId, body, now)`, `deleteTemplate(db, organizerId, templateId, now)` — 개설자만, `preparing`에서만, 본문 1~`BODY_MAX`자. 삭제 후 개수가 `missionCount`보다 적어지면 `TOO_FEW_TEMPLATES`.
  - `listTemplates(db, eventId): Promise<{ id: string; body: string }[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('slotTime: 10일 기간에 5개면 0, 2, 4, 6, 8일째', ...);
test('시작 직후 각 참가자에게 0번 미션이 하나씩', ...);
test('한 사람이 받은 미션 본문은 서로 다르다 (N=30, 템플릿 30)', ...);
test('advanceEvent를 두 번 불러도 슬롯당 한 건', ...);
test('종료 후 첫 호출이면 참가자마다 N건이 모두 배달되고 상태는 closed', ...);
test('missionCount 0이면 배달 없음', ...);
test('남의 미션 완료는 NOT_YOURS', ...);
test('마감 후 미션 완료는 NOT_ACTIVE', ...);
test('템플릿을 missionCount 아래로 지우면 TOO_FEW_TEMPLATES', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/missions` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `yarn test src/domain` 전체 PASS (Task 3 테스트 포함)
- [ ] **Step 5: Commit** — `feat: 미션 자동 배달과 완료`

---

### Task 5: 기록, 반응, 판정, 몰래 한 일

**Files:**
- Create: `src/domain/records.ts`
- Test: `src/domain/records.test.ts`

**Interfaces:**
- Consumes: `advanceEvent`, `getGiverIdOf`
- Produces (모든 함수는 먼저 `advanceEvent`를 부르고, 결과 상태가 `active`가 아니면 `NOT_ACTIVE`):
  - `createRecord(db, authorId, body: string, now): Promise<{ id: string }>` — 앞뒤 공백 제거 후 1~500자, 아니면 `INVALID_BODY`.
  - `updateRecord(db, authorId, recordId, body, now): Promise<void>` — 작성자만(`NOT_YOURS`). 판정은 유지.
  - `deleteRecord(db, authorId, recordId, now): Promise<void>` — 작성자만.
  - `toggleReaction(db, participantId, recordId, emoji: string, now): Promise<void>` — `REACTION_EMOJIS`에 없으면 `INVALID_EMOJI`. 있으면 지우고 없으면 넣는다. 다른 이벤트의 기록이면 `NOT_FOUND`.
  - `setVerdict(db, judgeId, recordId, isMine: boolean, now): Promise<void>` — `judgeId`가 기록 작성자의 마니또가 아니면 `NOT_FOUND`(존재 여부를 흘리지 않도록 `NOT_YOUR_TARGET` 같은 별도 코드를 쓰지 않는다). 이미 있으면 덮어쓴다.
  - `addSecretDeed(db, giverId, body, now): Promise<{ id: string }>`, `deleteSecretDeed(db, giverId, deedId, now): Promise<void>` — 본문 규칙 동일, 본인 것만.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('시작 전 기록은 NOT_ACTIVE', ...);
test('종료 시각이 지난 뒤 첫 요청이 기록 작성이면 NOT_ACTIVE이고 이벤트는 closed', ...);
test('공백뿐인 기록, 501자 기록은 INVALID_BODY', ...);
test('남의 기록 수정·삭제는 NOT_YOURS', ...);
test('마니또만 판정할 수 있다: 제3자와 작성자 본인은 NOT_FOUND', ...);
test('판정을 맞아요→아니에요로 바꾸면 한 건만 남고 값이 바뀐다', ...);
test('판정·반응이 달린 기록을 지우면 verdicts, reactions가 비워진다', ...);
test('같은 이모지를 두 번 누르면 사라진다', ...);
test("허용되지 않은 이모지 '💩'는 INVALID_EMOJI", ...);
test('남의 몰래 한 일 삭제는 NOT_YOURS', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/records` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: Commit** — `feat: 기록, 반응, 판정, 몰래 한 일`

---

### Task 6: 포인트와 모임 온도

**Files:**
- Create: `src/domain/scoring.ts`
- Test: `src/domain/scoring.test.ts`

**Interfaces:**
- Consumes: Task 1 상수, Task 3~5의 쓰기 함수(테스트 준비용)
- Produces:
  - `kstDayKey(d: Date): string` — KST 기준 `YYYY-MM-DD`.
  - `livePoints(db, eventId): Promise<Map<string, number>>` — 참가자 전원 포함(활동 없으면 0). 기록은 KST 하루당 작성 시각이 빠른 3건까지만 +10, 완료한 미션 건당 +10. **판정·배정 테이블을 읽지 않는다.**
  - `type FinalScore = { live: number; hit: number; recognized: number; verdict: number; secretDeed: number; guess: number; total: number }`
  - `finalScores(db, eventId): Promise<Map<string, FinalScore>>` — `hit`: 내 기록 중 `isMine=true` 건수×20. `recognized`: 내 대상의 기록 중 `isMine=true` 건수×20. `verdict`: 내가 내린 판정 건수×5. `secretDeed`: 건수×5. `guess`: 추측이 실제 마니또와 같으면 50.
  - `temperature(db, event: Event): Promise<number>` — `활동 수 = 기록 + 반응 + 완료한 미션 + 판정 + 몰래 한 일`, `목표 = 참가자 수 × (기간 일수(올림, 최소 1) × 2 + missionCount)`, `온도 = min(100, 36.5 + 63.5 × 활동 수 / 목표)`를 소수 첫째 자리로 반올림.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('kstDayKey: UTC 2026-12-01T15:30Z는 2026-12-02', ...);
test('활동이 없으면 전원 0점, 온도 36.5', ...);
test('같은 날 기록 4건이면 30점, 다음 날 1건 더 쓰면 40점', ...);
test('KST 자정 전후 기록은 서로 다른 날로 센다', ...);
test('미션 2개 완료하면 +20', ...);
test('판정이 내려져도 livePoints는 누구도 변하지 않는다', ...);
test('점수 인정된 기록을 지우면 그날 4번째 기록이 점수를 받는다', ...);
test('finalScores: 적중 2건, 인정 2건, 판정 3건, 몰래 한 일 1건, 추측 정답 → 각 40/40/15/5/50, total은 live와의 합', ...);
test('온도: 5명·10일·미션 5개(목표 125)에 활동 25건이면 49.2', ...);
test('온도는 100을 넘지 않는다', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/scoring` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: Commit** — `feat: 포인트와 모임 온도`

---

### Task 7: 보는 사람 기준 조회

**Files:**
- Create: `src/domain/views.ts`
- Test: `src/domain/views.test.ts`

**Interfaces:**
- Consumes: Task 3 `getTargetOf`/`getGiverIdOf`, Task 4 `listTemplates`, Task 6 `livePoints`/`temperature`
- Produces (이 타입들이 화면으로 나가는 데이터의 전부다. 필드를 추가하지 않는다):

```ts
type FeedItem = {
  id: string; author: { id: string; name: string }; body: string; createdAt: Date;
  isMine: boolean;                       // 내가 쓴 글
  verdictStatus: 'pending' | 'done';     // 누구에게나
  judge?: { myVerdict: boolean | null }; // 보는 사람이 작성자의 마니또일 때만 존재
  result?: boolean | null;               // 이벤트가 revealed일 때만 존재 (null = 미확인)
  reactions: { emoji: string; count: number; mine: boolean }[];
};
type Lobby = { participants: { id: string; name: string; isOrganizer: boolean }[]; startMissed: boolean; minParticipants: number };
type Duty = {
  target: { id: string; name: string };
  missions: { id: string; body: string; deliveredAt: Date; completed: boolean }[];
  targetRecords: FeedItem[];             // 대상이 쓴 글, judge 포함
  secretDeeds: { id: string; body: string; createdAt: Date }[];
};
type Ranking = {
  entries: { id: string; name: string; points: number; isMe: boolean }[]; // 점수 내림차순, 동점은 이름순
  stats: { recordCount: number; missionsDelivered: number; missionsCompleted: number };
};
```

  - `getLobby(db, eventId): Promise<Lobby>`
  - `getFeed(db, eventId, viewerId): Promise<FeedItem[]>` — 최신순.
  - `getDuty(db, eventId, viewerId): Promise<Duty | null>` — 배정 전이면 null.
  - `getRanking(db, eventId, viewerId): Promise<Ranking>`
  - `getHeader(db, event: Event, now: Date): Promise<{ temperature: number; dday: number | null }>` — `dday`는 KST 날짜 기준 종료일까지 남은 일수, `active`가 아니면 null.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// 준비: A→B 배정을 rng로 고정. B가 기록 r을 쓰고 A가 '맞아요' 판정.
test('마니또 A의 피드: r에 judge.myVerdict === true', ...);
test('작성자 B의 피드: r에 judge 키가 없고 result 키도 없다', () => {
  expect('judge' in item).toBe(false); expect('result' in item).toBe(false);
  expect(item.verdictStatus).toBe('done');
});
test('제3자 C의 피드: judge·result 키가 없다', ...);
test("B, C의 피드를 JSON.stringify한 문자열에 'judge', 'result', 'giverId', 'myVerdict'가 없다", ...);
test('revealed가 되면 모두에게 result가 보인다 (판정 없는 글은 null)', ...);
test('A의 내 임무: 대상은 B, B의 글만, A의 미션만, A의 몰래 한 일만', ...);
test('B의 내 임무에는 A가 쓴 몰래 한 일이 없다', ...);
test('배정 전 getDuty는 null', ...);
test('순위: 전원 포함, 점수 내림차순, 0점인 사람도 나온다', ...);
test('로비: 시작을 놓치면 startMissed true', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/views` FAIL
- [ ] **Step 3: 구현** — `judge`와 `result`는 조건이 맞을 때만 객체에 키를 넣는다(`undefined` 값으로 두지 않는다).
- [ ] **Step 4: 통과 확인** — PASS
- [ ] **Step 5: Commit** — `feat: 보는 사람 기준 조회`

---

### Task 8: 추측, 발표, 결과 데이터

**Files:**
- Create: `src/domain/reveal.ts`
- Test: `src/domain/reveal.test.ts`

**Interfaces:**
- Consumes: Task 6 `finalScores`/`temperature`, Task 3 배정 조회
- Produces:
  - `setGuess(db, participantId, guessedId, now): Promise<void>` — `closed`이고 `presentationStartedAt`이 null일 때만(`GUESS_CLOSED`). 자기 자신·다른 이벤트 사람은 `INVALID_GUESS`. 다시 고르면 덮어쓴다.
  - `getMyGuess(db, participantId): Promise<string | null>`
  - `startPresentation(db, organizerId, now): Promise<void>` — 개설자만, `closed`에서만(`NOT_CLOSED`). `presentationStartedAt = now`. 추측하지 않은 사람이 있어도 시작한다.
  - `finishPresentation(db, organizerId, now): Promise<void>` — 발표가 시작된 `closed`에서만. `revealed`로.
  - `getRevealData(db, eventId, viewerId): Promise<RevealData>` — (개설자이고 발표가 시작됨) 또는 `revealed`일 때만. 아니면 `NOT_REVEALED`.

```ts
type RevealData = {
  summary: { temperature: number; recordCount: number; missionsCompleted: number };
  chain: {                               // 고리 순서: 가장 먼저 입장한 사람부터, 다음 항목은 직전 항목의 giver
    receiver: { id: string; name: string };
    giver: { id: string; name: string };
    records: { body: string; createdAt: Date; result: boolean | null }[];
    unnoticedDeeds: { body: string; createdAt: Date }[];   // giver의 몰래 한 일
    guess: { name: string; correct: boolean } | null;      // receiver의 추측
  }[];
  scores: { id: string; name: string; score: FinalScore }[];  // total 내림차순, 동점은 이름순
  awards: {                              // 각 상은 최댓값이 0이면 빈 배열, 동점자는 모두 포함
    nunchi: string[];    // 내 기록이 '맞아요'로 판정된 건수 최다
    heotdari: string[];  // 내 기록이 '제가 아니에요'로 판정된 건수 최다
    shadow: string[];    // 몰래 한 일 건수 최다
    mission: string[];   // 완료한 미션 수 최다
  };                                     // 값은 이름
};
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('진행 중 추측은 GUESS_CLOSED, 마감 후에는 저장, 다시 고르면 덮어쓴다', ...);
test('자기 자신 추측은 INVALID_GUESS', ...);
test('발표 시작 후 추측은 GUESS_CLOSED', ...);
test('진행 중 startPresentation은 NOT_CLOSED, 개설자가 아니면 NOT_ORGANIZER', ...);
test('발표 시작 전에는 개설자도 getRevealData가 NOT_REVEALED', ...);
test('발표 중: 개설자는 볼 수 있고 다른 참가자는 NOT_REVEALED', ...);
test('발표 종료 후: 모든 참가자가 볼 수 있다', ...);
test('chain은 전원을 한 번씩 포함하고, 각 항목의 giver가 다음 항목의 receiver다', ...);
test('chain 항목: 맞은 기록 true, 아닌 기록 false, 판정 없는 기록 null, 몰래 한 일은 giver의 것', ...);
test('추측하지 않은 사람은 guess가 null', ...);
test('awards: 동점이면 둘 다, 아무도 해당 없으면 빈 배열', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/domain/reveal` FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `yarn test` 전체 PASS
- [ ] **Step 5: Commit** — `feat: 마니또 추측과 결과 발표 데이터`

---

### Task 9: 화면 기반 — 개설, 입장, 로비

**Files:**
- Create: `src/lib/viewer.ts`, `src/lib/action.ts`, `src/lib/format.ts`, `src/app/page.tsx`, `src/app/new/page.tsx`, `src/app/new/actions.ts`, `src/app/e/[code]/page.tsx`, `src/app/e/[code]/layout.tsx`, `src/app/e/[code]/actions.ts`, `src/app/e/[code]/_components/{JoinForm,LoginForm,Lobby,PinResetNotice,TabBar}.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: `src/lib/format.test.ts`, `src/lib/action.test.ts`

**Interfaces:**
- Consumes: Task 2, 3, 7의 함수
- Produces:
  - `getViewer(code: string): Promise<{ event: Event; me: Participant | null } | null>` — 이벤트가 없으면 null. `advanceEvent`를 부른 뒤, 쿠키 `manito_<code>`의 토큰이 이 이벤트의 참가자와 맞으면 `me`를 채운다.
  - `setSession(code: string, participant: Participant): Promise<void>` — httpOnly, sameSite lax, 운영에서는 secure, 90일.
  - `type ActionResult = { ok: true } | { ok: false; error: string }`
  - `runAction(fn: () => Promise<void>): Promise<ActionResult>` — `DomainError`는 `{ ok: false, error: message }`로, 그 밖의 오류는 서버 로그에 남기고 `error: '잠시 후 다시 시도해 주세요.'`.
  - `requireMe(code: string): Promise<{ event: Event; me: Participant }>` — 없으면 `DomainError('NOT_LOGGED_IN', '다시 입장해 주세요.')`.
  - `format.ts`: `formatKst(d: Date): string`(`12월 3일 14:20`), `formatTemp(t: number): string`(`52.5℃`), `ddayLabel(n: number): string`(`D-9`, 0이면 `D-DAY`).
  - Server Actions(`e/[code]/actions.ts`, 모두 `ActionResult` 반환, 성공 시 `revalidatePath('/e/[code]', 'layout')`): `joinAction(code, name, pin)`, `loginAction(code, participantId, pin)`, `setNewPinAction(code, participantId, pin)`, `ackPinResetAction(code)`. 이후 Task가 같은 파일에 추가한다.
  - `createEventAction(formData)`(`new/actions.ts`) — 관리 비밀번호 확인 → `createEvent` → 세션 설정 → `/e/<code>`로 이동. 날짜 입력값은 KST로 해석한다.

**화면:**
- `/`: 서비스 한 줄 소개, "이벤트 만들기" 링크. 초대 링크로 들어오라는 안내.
- `/new`: 관리 비밀번호, 이벤트 이름, 시작·종료 일시, 미션 개수(기본 5), 내 이름, 내 PIN.
- `/e/[code]`에서 `me`가 없을 때: `preparing`이면 입장 폼(이름 + PIN)과 "이미 입장했어요"(이름 선택 + PIN). 그 외 단계면 이름 선택 + PIN만. `pinHash`가 null인 이름을 고르면 새 PIN 설정.
- `me`가 있고 `preparing`: 로비 — 이벤트 이름, 시작 일시, 입장한 사람 명단, 초대 링크 복사 버튼, 4명 미만이면 "4명부터 시작할 수 있어요", `startMissed`면 개설자에게 "시작 일시를 다시 정해 주세요" + 설정 링크.
- `me.pinResetAt`이 있으면 상단에 "개설자가 PIN을 초기화했어요 (시각)" 알림과 확인 버튼.
- `layout.tsx`: `active` 이후 하단 탭(홈 / 내 임무 / 순위, 개설자는 설정 추가).
- 분위기: 따뜻하고 가벼운 톤, 모바일 폭 기준 한 손 조작. 색·글꼴은 `frontend-design` 스킬의 지침을 따라 정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// format.test.ts
test("formatKst(2026-12-03T05:20:00Z) === '12월 3일 14:20'", ...);
test("ddayLabel(9) === 'D-9', ddayLabel(0) === 'D-DAY'", ...);
test("formatTemp(52.5) === '52.5℃', formatTemp(40) === '40.0℃'", ...);
// action.test.ts
test('DomainError는 message를 error로 돌려준다', ...);
test("그 밖의 오류는 '잠시 후 다시 시도해 주세요.'", ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/lib` FAIL
- [ ] **Step 3: 구현** — lib 3개 → Server Action → 페이지와 컴포넌트
- [ ] **Step 4: 통과 확인** — `yarn test` PASS, `yarn tsc --noEmit`, `yarn build` 성공
- [ ] **Step 5: Commit** — `feat: 개설, 입장, 로비 화면`

---

### Task 10: 진행 화면 — 홈(피드), 내 임무, 순위

**Files:**
- Create: `src/app/e/[code]/duty/page.tsx`, `src/app/e/[code]/rank/page.tsx`, `src/app/e/[code]/_components/{Header,Feed,FeedCard,RecordForm,ReactionBar,JudgeButtons,MissionList,SecretDeeds,AutoRefresh}.tsx`
- Modify: `src/app/e/[code]/page.tsx`, `src/app/e/[code]/actions.ts`

**Interfaces:**
- Consumes: Task 7의 `getFeed`/`getDuty`/`getRanking`/`getHeader`, Task 4·5의 쓰기 함수, Task 9의 `requireMe`/`runAction`
- Produces: Server Actions — `createRecordAction(code, body)`, `updateRecordAction(code, recordId, body)`, `deleteRecordAction(code, recordId)`, `toggleReactionAction(code, recordId, emoji)`, `setVerdictAction(code, recordId, isMine)`, `completeMissionAction(code, deliveryId)`, `addSecretDeedAction(code, body)`, `deleteSecretDeedAction(code, deedId)`

**화면:**
- 홈(`active`): 상단에 모임 온도(게이지 + 숫자)와 D-day, 기록 입력란, 피드. 카드에는 작성자·시각·본문·반응·"마니또 확인: 대기 중 / 완료 (결과는 종료 때 공개)". `item.isMine`이면 수정·삭제. `item.judge`가 있을 때만 `[맞아요] [제가 아니에요]`를 그리고 현재 선택을 표시한다.
- `AutoRefresh`: 20초마다 `router.refresh()`, 탭이 보이지 않으면 멈춘다.
- 내 임무: "내가 챙길 사람: ○○", 받은 미션 목록(완료 체크), 대상이 올린 기록(판정 버튼), 몰래 한 일 메모 입력과 목록. `getDuty`가 null이면 "시작하면 여기에 나타나요".
- 순위: `entries`를 점수순 막대로. 등수 숫자는 표시하지 않고 내 줄만 강조. 아래에 전체 기록 수와 미션 완료율(`missionsCompleted / missionsDelivered`, 배달 0건이면 표시 안 함).
- `FeedCard` 등 클라이언트 컴포넌트는 `FeedItem`/`Duty`/`Ranking`만 props로 받는다.

- [ ] **Step 1: Server Action 추가** — 각 액션은 `runAction(async () => { const { me } = await requireMe(code); await 도메인함수(getDb(), me.id, …, new Date()); })` 형태
- [ ] **Step 2: 페이지와 컴포넌트 구현**
- [ ] **Step 3: 검증** — `yarn tsc --noEmit`, `yarn build` 성공. `grep -rn "db/schema" src/app` 결과가 타입 import 외에는 없어야 한다.
- [ ] **Step 4: Commit** — `feat: 피드, 내 임무, 순위 화면`

---

### Task 11: 설정, 마감, 발표, 결과 화면

**Files:**
- Create: `src/app/e/[code]/settings/page.tsx`, `src/app/e/[code]/present/page.tsx`, `src/app/e/[code]/result/page.tsx`, `src/app/e/[code]/_components/{SettingsForm,TemplateEditor,ParticipantAdmin,GuessForm,Slides,ResultView}.tsx`, `src/app/e/[code]/_components/slides.ts`
- Modify: `src/app/e/[code]/page.tsx`, `src/app/e/[code]/actions.ts`
- Test: `src/app/e/[code]/_components/slides.test.ts`

**Interfaces:**
- Consumes: Task 2·4·8의 함수, `RevealData`
- Produces:
  - Server Actions — `updateSettingsAction(code, formData)`, `addTemplateAction`, `updateTemplateAction`, `deleteTemplateAction`, `removeParticipantAction(code, targetId)`, `resetPinAction(code, targetId)`, `resetOrganizerPinAction(code, adminPassword)`, `setGuessAction(code, guessedId)`, `startPresentationAction(code)`, `finishPresentationAction(code)`
  - `buildSlides(data: RevealData): Slide[]` (`slides.ts`):

```ts
type Slide =
  | { kind: 'summary'; summary: RevealData['summary'] }
  | { kind: 'question'; receiverName: string }                    // "○○의 마니또는…"
  | { kind: 'answer'; entry: RevealData['chain'][number] }        // "△△였습니다!" + 기록·선행·추측
  | { kind: 'awards'; awards: RevealData['awards'] }
  | { kind: 'podium'; top: { name: string; total: number }[] }    // 상위 3명(3위 동점은 모두)
  | { kind: 'end' };
// 순서: summary, (question, answer)×인원수, awards, podium, end
```

**화면:**
- 설정(개설자만, 아니면 홈으로): `preparing`에서는 이벤트 정보 수정, 미션 목록 편집, 참가자 삭제. 모든 단계에서 참가자 PIN 초기화. `closed`에서는 "결과 발표 시작" 버튼(아직 추측하지 않은 인원 수 표시).
- 로그인 폼(Task 9)에 "개설자 PIN을 잊었어요" → 관리 비밀번호 입력으로 `resetOrganizerPinAction`.
- 홈(`closed`): "이벤트가 끝났어요. 발표를 기다려 주세요" + 추측 폼(나를 뺀 명단에서 선택, 발표가 시작되면 잠김) + 읽기 전용 피드.
- 발표(`/present`, 개설자만): `getRevealData`가 `NOT_REVEALED`면 설정으로 돌려보낸다. 큰 글씨, 한 화면에 한 장. 현재 장은 `?s=<번호>`로 두어 새로고침해도 유지. 좌우 화살표 키·화면 클릭으로 이동. 마지막 장에 "발표 끝내기" 버튼 → `finishPresentationAction` → `/result`.
- 결과(`/result`, `revealed`에서만, 아니면 홈으로): 최종 온도와 요약, 누가 누구의 마니또였는지 전체, 사람별 상세(기록의 맞음/아님/미확인, 몰래 한 일, 추측), 시상, 전원 최종 점수(순위 화면과 같은 막대, 등수 숫자 없음). `revealed`에서 홈은 결과 링크와 판정 결과가 보이는 피드.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test('5명이면 슬라이드는 1 + 10 + 3 = 14장이고 순서가 맞다', ...);
test('question 다음 장은 같은 receiver의 answer다', ...);
test('podium: 3위 동점이면 4명', ...);
test('podium: 참가자가 4명이어도 상위 3명만', ...);
```

- [ ] **Step 2: 실패 확인** — `yarn test src/app` FAIL
- [ ] **Step 3: 구현** — `slides.ts` → Server Action → 페이지와 컴포넌트
- [ ] **Step 4: 통과 확인** — `yarn test` PASS, `yarn tsc --noEmit`, `yarn build` 성공
- [ ] **Step 5: Commit** — `feat: 설정, 발표, 결과 화면`

---

### Task 12: 배포 구성과 데모 데이터

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `src/instrumentation.ts`, `scripts/seed-demo.ts`
- Modify: `README.md`, `.env.example`, `package.json`

**Interfaces:**
- Consumes: 전체 도메인 함수
- Produces:
  - `docker-compose.yml`: `db`(postgres:16, 이름 있는 볼륨, 외부 포트 미공개), `app`(빌드, `db` healthy 이후 시작, `3000` 공개, `.env` 사용, `restart: unless-stopped`).
  - `Dockerfile`: 멀티 스테이지, Next standalone 출력, `drizzle/` 폴더를 실행 이미지에 포함, non-root 실행.
  - `instrumentation.ts`: `NEXT_RUNTIME === 'nodejs'`이고 `NODE_ENV === 'production'`일 때 `drizzle-orm/node-postgres/migrator`의 `migrate`를 실행. 실패하면 오류를 던져 서버가 뜨지 않게 한다.
  - `yarn seed:demo <stage>` — `stage`는 `preparing | active | closed | revealed`. `DATABASE_URL`의 DB에 6명짜리 데모 이벤트를 그 단계까지 도메인 함수로 진행시켜 만들고(과거 시각의 `now`를 넘겨 진행), 초대 링크 경로와 참가자 이름·PIN(전원 `0000`)을 출력한다.
  - `README.md`: 로컬 실행(`docker compose up db` → `.env` → `yarn dev`), 테스트, 데모 데이터, NCP 배포 절차(서버 생성 → Docker 설치 → ACG에서 80/443 열기 → `.env` 작성 → `docker compose up -d --build` → 리버스 프록시와 HTTPS(Caddy 권장) → `pg_dump` 백업 예시), 환경변수 표.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 검증** — `docker compose build` 성공. `docker compose up -d` 후 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` → `200`, `docker compose logs app`에 마이그레이션 오류 없음. 확인 후 `docker compose down`. (Docker를 쓸 수 없는 환경이면 `yarn build`까지만 하고 그 사실을 보고한다.)
- [ ] **Step 3: 사용자 확인 요청** — 사용자에게 `yarn seed:demo active`, `yarn seed:demo closed` 후 `yarn dev`로 진행·발표 화면을 직접 눌러 보도록 안내한다.
- [ ] **Step 4: Commit** — `chore: Docker 배포 구성과 데모 데이터`
