# 마니또 (manito-web)

5~10명 모임이 며칠 동안 서로의 마니또가 되어 보는 웹 서비스입니다. 배정하고 끝나는 것이 아니라, 기간 내내 받은 사람이 기록을 남기고 모두가 피드로 보며, 끝나는 날 한 화면에서 결과를 함께 열어 봅니다.

직접 서버에 올려 쓰는 셀프 호스팅 방식이고, Docker가 도는 서버 한 대면 충분합니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 목차

- [무엇을 할 수 있나요](#무엇을-할-수-있나요)
- [진행 흐름](#진행-흐름)
- [기술 구성](#기술-구성)
- [빠른 시작](#빠른-시작)
- [환경변수](#환경변수)
- [배포](#배포)
- [프로젝트 구조](#프로젝트-구조)
- [기여하기](#기여하기)
- [보안](#보안)
- [라이선스](#라이선스)

## 무엇을 할 수 있나요

- **비밀 배정** — 시작 일시에 서버가 전원을 하나의 고리(A→B→C→…→A)로 무작위 배정합니다. 각자 자기 대상만 볼 수 있고, 개설자도 배정을 볼 수 없습니다.
- **받은 사람이 쓰는 기록** — "책상에 커피가 놓여 있었어요" 같은 글을 받은 사람이 올리면 전원의 피드에 보입니다. 글에는 이모지 반응을 달 수 있습니다.
- **마니또의 몰래 판정** — 기록 작성자의 마니또에게만, 본인만 보는 `내 임무` 화면에서 `맞아요 / 제가 아니에요` 버튼이 보입니다. 결과는 발표 때까지 작성자를 포함해 누구에게도 보이지 않습니다.
- **몰래 한 일** — 대상이 눈치채지 못한 선행을 마니또가 본인만 보는 메모로 남기고, 발표 때 공개합니다. 점수는 메모를 남긴 날마다 한 번만 받습니다.
- **자동 미션** — 기본 미션 60개에서 사람마다 무작위로 골라 매일 정한 시각에 내려줍니다. 매일 방식에서는 미션 3개를 보여 주고 그중 하나를 본인이 골라서 합니다(이틀에 하나, 개수 직접 정하기는 하나씩 정해서 내려줌). 개설자는 시작 전에 목록을 고칠 수 있고, 전체 목록은 결과에서 공개됩니다.
- **포인트와 모임 온도** — 개인 참여 포인트와 모두의 활동으로 오르는 온도(36.5℃에서 시작)를 실시간으로 보여줍니다. 실시간 숫자는 배정이나 판정과 무관한 활동으로만 움직여서 누가 누구의 마니또인지 드러나지 않습니다. 순위와 결과 화면에서 사람별 점수 내역(어디서 몇 점)을 볼 수 있습니다.
- **알림** — 미션 도착, 내 대상의 새 기록, 마감과 발표를 웹 푸시로 알려 줍니다. 알림 글귀에는 사람 이름이 들어가지 않습니다. VAPID 키를 설정했을 때만 켜집니다.
- **개설자 도구** — 인원이 모이면 시작 시각 전에 바로 시작하고, 진행 중에 종료 일시를 바꾸거나 바로 마감할 수 있습니다. 진행 중에 빠진 사람을 내보내면 그 사람의 마니또가 대상을 이어받아 고리가 유지됩니다.
- **결과 발표** — 마감 후 각자 내 마니또를 추측하고, 개설자가 큰 화면에서 한 장씩 넘기며 공개합니다. 발표가 끝나면 전원의 폰에서 결과가 열립니다.
- **시상** — 눈치왕, 헛다리왕, 미션왕을 부문마다 한 명씩 뽑습니다. 수가 같으면 부문에 맞는 기준(적중률, 완료율 등), 아직 상을 받지 않은 사람, 먼저 도달한 사람 순으로 정합니다. 추첨은 하지 않습니다.
- **샘플 둘러보기** — `DEMO_MODE=1`이면 누구나 샘플 이벤트로 기능을 미리 써 볼 수 있습니다. 실제 이벤트에는 닿지 않습니다.
- **앱 안 사용 설명서** — `/guide`에서 [사용 설명서](docs/USER_GUIDE.md)를 그대로 보여 줍니다.
- **휴대폰에 맞춘 화면** — 아래 탭 메뉴, 밝은·어두운 모드(기기 설정을 따름), 홈 화면에 추가해 앱처럼 쓰기를 지원합니다.

회원가입은 없습니다. 초대 링크로 들어와 이름과 4자리 PIN을 정하면 됩니다. 기기나 브라우저를 바꿔도 같은 이름과 PIN으로 다시 들어오면 이어집니다. 화면은 한국어, 시간대는 Asia/Seoul 고정이고 휴대폰 화면을 기준으로 만들었습니다(발표 화면만 큰 화면 기준).

## 진행 흐름

`준비 → 진행 → 마감 → 발표 완료`

| 단계 | 넘어가는 조건 | 할 수 있는 것 |
| --- | --- | --- |
| 준비 | 이벤트 개설 | 초대 링크로 입장, 개설자가 일정·미션 보내는 방식·미션 목록 수정 |
| 진행 | 시작 일시 도달 (자동) 또는 개설자의 `지금 시작하기` | 기록, 반응, 판정, 미션, 몰래 한 일 메모 |
| 마감 | 종료 일시 도달 (자동) 또는 개설자의 `지금 마감하기` | 내 마니또 추측, 개설자의 발표 진행(한 명씩 공개, 시상) |
| 발표 완료 | 개설자가 발표를 끝냄 | 전원이 결과 열람(전체 배정, 사람별 이야기, 시상, 미션 목록, 점수 내역) |

- 이벤트 개설(`/new`)은 서버에 설정한 관리 비밀번호(`ADMIN_PASSWORD`)를 아는 사람만 할 수 있습니다.
- 단계 전환, 미션 배달, 알림 발송은 서버가 1분마다 점검해 처리하므로, 아무도 접속하지 않아도 제때 넘어갑니다.
- 시작할 때 그때까지 입장한 사람으로 명단이 확정됩니다. 최소 인원은 4명이고, 모자라면 시작하지 않고 준비 단계에 머뭅니다.
- 한 서버에서 이벤트 여러 개를 동시에 운영할 수 있습니다.

개설자와 참가자가 화면에서 무엇을 어떻게 하는지는 [사용 설명서](docs/USER_GUIDE.md)에 있습니다. 앱 안의 `/guide` 화면이 이 문서를 그대로 보여 주므로, 문서만 고치면 도움말도 함께 바뀝니다. 지금 적용되는 규칙(미션 보내는 방식, 점수, 시상)은 사용 설명서가 기준입니다.

## 기술 구성

- [Next.js](https://nextjs.org/) 16 (App Router, Server Actions), React 19, Tailwind CSS 4
- PostgreSQL 16, [Drizzle ORM](https://orm.drizzle.team/)
- 알림: Web Push([web-push](https://github.com/web-push-libs/web-push))와 서비스 워커
- 글꼴: [Pretendard](https://github.com/orioncactus/pretendard). 설명서 화면은 [marked](https://marked.js.org/)로 Markdown을 변환
- 테스트: Vitest + [PGlite](https://pglite.dev/) (별도 DB 없이 실행)
- 배포: Docker Compose, 리버스 프록시는 Caddy 권장

## 빠른 시작

Node.js 24와 yarn 1.x만 있으면 됩니다. Docker도 PostgreSQL도 필요 없습니다.

```bash
git clone https://github.com/park-gwimong/manito-web.git
cd manito-web
yarn install
yarn dev
```

http://localhost:3000/dev 를 엽니다.

개발 서버는 `DATABASE_URL`이 없으면 내장 DB([PGlite](https://pglite.dev/))를 `.local/pgdata`에 만들어 쓰고, 처음 켤 때 단계별 샘플 이벤트 4개를 넣어 둡니다. `.env` 없이도 동작합니다(관리 비밀번호는 `admin`, 세션 키는 개발용 기본값).

### 둘러보기 화면 (`/dev`)

개발 서버에서 열리는 화면입니다. 운영에서는 기본으로 404이고, `DEMO_MODE=1`을 넣으면 샘플 이벤트만 다루는 화면으로 열립니다([운영에서 둘러보기 켜기](#운영에서-둘러보기-켜기)).

- 준비, 진행, 마감, 발표 완료 단계의 샘플 이벤트가 하나씩 있고, 6명(민지 · 준호 · 서연 · 도윤 · 하은 · 지우)이 참여하고 있습니다. 민지가 개설자입니다.
- 이름을 누르면 PIN 없이 그 사람으로 들어갑니다. 여러 사람의 화면을 번갈아 볼 수 있습니다. 로그인 화면을 직접 써 보려면 PIN은 모두 `0000`입니다.
- 실제 서비스에서는 아무도 볼 수 없는 배정표(누가 누구를 챙기는지)를 보여 줍니다. 판정 버튼은 글쓴이의 마니또에게만 보이므로, 누구로 들어가야 하는지 여기서 확인합니다.
- 단계마다 확인해 볼 것이 적혀 있습니다.

| 샘플 단계 | 상태 |
| --- | --- |
| 준비 | 내일 시작. 참가자 6명이 로비에 모여 있음 |
| 진행 | 3일 전에 시작해 4일 뒤 끝남. 기록, 반응, 판정, 몰래 한 일, 완료한 미션이 쌓여 있음. 미션은 매일 1개 방식 |
| 마감 | 어제 마감됨. 마니또 추측까지 끝났고 발표 대기 중 (민지로 발표 시작 가능) |
| 발표 완료 | 발표까지 끝난 결과 화면 |

샘플은 만든 시점 기준이라 며칠 지나면 단계가 저절로 넘어갑니다. 처음 상태로 되돌리려면 개발 서버를 끄고 다음을 실행한 뒤 다시 켜세요.

```bash
yarn dev:reset
```

### 운영에서 둘러보기 켜기

서버의 `.env`에 `DEMO_MODE=1`을 넣고 앱을 다시 띄우면 운영에서도 `/dev`가 열리고, 첫 화면에 둘러보기 링크가 생깁니다.

- 샘플 이벤트 4개를 서버가 직접 만들고, 하루에 한 번 지우고 다시 만듭니다. 샘플에는 표시(`events.demo_seeded_at`)가 붙습니다.
- 표시가 있는 이벤트만 화면에 나오고, PIN 없이 들어가기도 그 이벤트에만 됩니다. 실제 이벤트의 배정은 보이지 않습니다.
- 주소를 아는 사람은 누구나 샘플에 들어가 글을 쓸 수 있습니다. 쓴 글은 다음에 새로 만들 때 사라집니다.
- 관리 비밀번호는 이 화면에 나오지 않습니다.
- 끄려면 `DEMO_MODE`를 지우고 다시 띄웁니다. 남은 샘플 이벤트는 초대 링크로만 열립니다.

### PostgreSQL로 개발하기

운영과 같은 DB로 확인하고 싶을 때만 필요합니다. `.env`에 `DATABASE_URL`을 넣으면 개발 서버가 그 DB에 마이그레이션을 적용하고, 이벤트가 하나도 없으면 같은 샘플을 넣습니다(`DEV_SEED=0`이면 넣지 않습니다).

배포용 `docker-compose.yml`은 DB 포트를 호스트에 열지 않으므로 로컬용 파일을 하나 만들어 함께 씁니다.

```yaml
# docker-compose.local.yml (커밋하지 마세요)
services:
  db:
    ports:
      - "127.0.0.1:5432:5432"
```

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up db -d
yarn dev
```

샘플 이벤트를 더 만들려면 `yarn seed:demo <preparing|active|closed|revealed>`를 실행합니다. `DATABASE_URL`의 DB에 이벤트 하나를 추가하고 초대 링크 경로를 출력합니다.

### 테스트와 검사

```bash
yarn test            # 규칙과 화면 로직 테스트 (PGlite, 별도 DB 불필요)
yarn lint
yarn next typegen    # 새로 clone했다면 먼저 실행 (또는 yarn build)
yarn tsc --noEmit
```

`PageProps`, `LayoutProps` 같은 라우트 타입은 `yarn next typegen`(또는 빌드)이 만들어 줍니다. 새로 clone한 직후에 `tsc`만 실행하면 이 타입을 찾지 못해 실패합니다.

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | 앱이 접속할 PostgreSQL 주소. Docker Compose에서는 `POSTGRES_*` 값으로 자동 구성되어 이 값을 덮어씁니다. 개발 서버에서는 비워 두면 내장 DB를 씁니다. |
| `SESSION_SECRET` | 세션 쿠키 서명 키. 길고 무작위인 문자열이어야 합니다(`openssl rand -base64 48`). 바꾸면 모든 사용자가 로그아웃됩니다. |
| `ADMIN_PASSWORD` | 이벤트 개설(`/new`)과 개설자 PIN 초기화에 쓰는 관리 비밀번호 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose가 만드는 DB 설정. 비밀번호는 URL에 들어가므로 영문·숫자만 쓰세요(`openssl rand -hex 24`). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 웹 푸시 알림용 키 한 쌍(`npx web-push generate-vapid-keys`). 둘 다 있어야 알림 기능이 켜지고, 없으면 알림 칸이 화면에 나오지 않습니다. 개발 서버는 없으면 `.local/vapid.json`에 만들어 씁니다. 바꾸면 기존에 알림을 켠 기기는 다시 켜야 합니다. |
| `VAPID_SUBJECT` | 푸시 서비스가 운영자에게 연락할 주소. `mailto:you@example.com` 또는 `https://` 주소. 알림을 쓴다면 실제 연락처로 설정하세요. |
| `APP_PORT` | 앱을 공개할 호스트 포트(기본 `3000`). 루프백(`127.0.0.1`)에만 열립니다. |
| `DEMO_MODE` | `1`이면 운영에서도 샘플 둘러보기(`/dev`)를 엽니다. 샘플 이벤트만 다루며 하루에 한 번 새로 만듭니다. 기본은 꺼짐. |
| `DEV_SEED` | 개발 서버 전용. `0`이면 샘플 이벤트를 넣지 않습니다. |

## 배포

Docker가 설치된 리눅스 서버 한 대와 그 서버를 가리키는 도메인이 필요합니다. 클라우드 종류는 가리지 않습니다. 메모리 2GB 정도면 실행에는 충분하지만, 서버에서 직접 이미지를 빌드하려면 디스크 여유가 5GB 이상 있어야 합니다.

**반드시 HTTPS로 서비스해야 합니다.** 운영 환경에서는 세션 쿠키에 `secure` 속성이 붙기 때문에, 일반 HTTP로 접속하면 브라우저가 쿠키를 저장하지 않아 로그인이 오류 없이 조용히 실패합니다.

1. **방화벽** — 인바운드 TCP 80, 443을 엽니다. SSH(22)는 관리하는 IP로 제한하고, 3000과 5432는 열지 않습니다.

2. **Docker 설치** — Docker Engine과 Compose 플러그인을 설치합니다. ([공식 설치 문서](https://docs.docker.com/engine/install/))

3. **`.env` 작성** — 저장소를 clone하고 비밀값 세 개를 새로 만들어 넣습니다. 서비스가 인터넷에 공개되고 `ADMIN_PASSWORD`가 이벤트 개설을 지키므로, `change-me` 같은 예시 값을 그대로 쓰면 안 됩니다. (`POSTGRES_PASSWORD`는 비어 있는 경우만 compose가 막으므로 `change-me`도 통과해 버립니다.)

   ```bash
   git clone https://github.com/park-gwimong/manito-web.git && cd manito-web
   cp .env.example .env && chmod 600 .env
   sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48)|" .env
   sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
   sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -hex 12)|" .env
   grep -n "change-me" .env | grep -v DATABASE_URL    # 아무것도 나오지 않아야 합니다
   grep ADMIN_PASSWORD .env    # 개설할 때 쓸 비밀번호이니 따로 적어 두세요
   ```

   `DATABASE_URL`은 compose가 `POSTGRES_*`로 다시 만들므로 운영에서는 쓰이지 않습니다(그래서 위 확인 명령은 이 줄을 빼고 봅니다).

4. **실행** — 아래 두 방법 중 하나를 고릅니다. 어느 쪽이든 앱은 시작할 때 마이그레이션을 먼저 적용하고, 실패하면 서버가 뜨지 않습니다(`docker compose logs app`으로 확인).

   **방법 A: 서버에서 빌드**

   ```bash
   docker compose up -d --build
   ```

   **방법 B: 다른 PC에서 빌드해 이미지만 전송** — 서버 디스크나 메모리가 작을 때 씁니다. 빌드하는 PC에서:

   ```bash
   TAG=$(git rev-parse --short HEAD)
   docker build --platform linux/amd64 -t manito-web:$TAG .
   docker save manito-web:$TAG | gzip | ssh <사용자>@<서버> 'gunzip | docker load'
   ```

   서버의 저장소 폴더에 `docker-compose.override.yml`을 만들어 그 이미지를 쓰게 합니다(`<TAG>`는 위에서 만든 태그).

   ```yaml
   services:
     app:
       image: manito-web:<TAG>
       pull_policy: never
   ```

   ```bash
   docker compose up -d --no-build
   ```

   DB는 이름 있는 볼륨(`pgdata`)에 저장되며 외부로 포트를 공개하지 않습니다. 앱은 호스트의 루프백 주소 `127.0.0.1:3000`으로만 열리므로, 바깥에서는 아래 리버스 프록시를 통해서만 접속할 수 있습니다.

5. **리버스 프록시와 HTTPS** — Caddy를 권장합니다. 설치하고(`apt install caddy`) `/etc/caddy/Caddyfile`을 다음처럼 작성하면 인증서를 자동으로 발급·갱신합니다.

   ```caddyfile
   manito.example.com {
       reverse_proxy localhost:3000
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

### 업데이트

- 방법 A: `git pull && docker compose up -d --build`
- 방법 B: 새 태그로 이미지를 빌드해 전송하고, `docker-compose.override.yml`의 태그를 바꾼 뒤 `docker compose up -d --no-build`

앱이 시작할 때 새 마이그레이션을 자동으로 적용합니다. 스키마가 바뀌는 업데이트라면 먼저 아래 방법으로 백업해 두세요.

방법 B를 쓰면 이전 이미지가 서버에 쌓입니다. 되돌릴 때 쓸 바로 이전 것만 남기고 `docker rmi manito-web:<옛 태그>`로 지워 주세요.

### 백업

```bash
# 백업
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > manito-$(date +%F).sql
# 복원 (빈 DB에)
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < manito-2026-01-01.sql
```

이벤트 기간에는 cron으로 매일 실행하고 서버 밖에 사본을 보관하세요.

## 프로젝트 구조

```
src/
  app/              화면과 Server Action (Next.js App Router)
    _components/    여러 화면이 함께 쓰는 부품 (버튼, 입력 칸, 미션 보내는 방식 고르기)
    new/            이벤트 개설
    dev/            둘러보기 화면 (개발 서버, 또는 운영에서 DEMO_MODE=1일 때)
    guide/          앱 안 사용 설명서
    e/[code]/       이벤트 홈(피드), duty(내 임무), rank(순위),
                    settings(개설자 설정), present(발표), result(결과)
    manifest.ts     홈 화면에 추가할 때 쓰는 앱 정보
  domain/           규칙이 모여 있는 곳: 배정, 기록, 판정, 미션, 포인트, 발표
    views.ts        "보는 사람 기준" 조회. 화면에 내려가는 데이터는 여기서 걸러집니다
    reveal.ts       발표 데이터. 배정과 판정이 밖으로 나가는 유일한 경로
    mission-plan.ts 미션이 언제 도착하는지 (매일, 이틀, 개수 직접 정하기)
    scoring.ts      참여 포인트, 최종 점수와 그 내역, 모임 온도
    awards.ts       시상 부문과 동점일 때 한 명을 정하는 순서
    notifications.ts  보낼 알림을 쌓고 꺼내는 곳
    constants.ts    포인트, 온도, PIN 잠금 같은 조정 가능한 값
  db/               Drizzle 스키마와 DB 연결
  dev/              내장 DB 준비(개발 서버 전용), 샘플 데이터, 둘러보기 화면 데이터
  lib/              세션, 액션 래퍼, 표시 형식, 알림 발송(push.ts), 1분마다 도는 점검(scheduler.ts)
  instrumentation.ts  서버 시작 시 마이그레이션 적용과 점검 시작 (개발 서버에서는 샘플 준비)
public/             서비스 워커(sw.js)와 앱 아이콘
drizzle/            마이그레이션 SQL
scripts/            샘플 이벤트 추가 스크립트
docs/               사용 설명서(USER_GUIDE.md)
```

화면(`src/app`)은 DB 스키마를 직접 읽지 않고 `src/domain`의 함수만 호출합니다. 비밀 정보가 화면으로 새지 않게 하는 경계이므로 유지해 주세요.

## 기여하기

이슈와 Pull Request를 환영합니다. 큰 변경은 먼저 이슈로 방향을 이야기해 주세요.

- 규칙을 바꾸는 변경에는 `src/domain`에 테스트를 함께 넣어 주세요.
- PR을 올리기 전에 `yarn test`, `yarn lint`, `yarn tsc --noEmit`이 통과하는지 확인해 주세요.
- 스키마를 바꿨다면 `yarn db:generate`로 만든 마이그레이션을 함께 커밋해 주세요.
- 이 서비스에서 가장 중요한 것은 **발표 전에 배정과 판정 결과가 새지 않는 것**입니다. 화면, 응답 데이터, 오류 메시지, 점수가 오르는 시점 어느 쪽으로도 드러나지 않는지 살펴 주세요.
- 이 프로젝트의 Next.js는 최신 버전이라 익숙한 API와 다를 수 있습니다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 문서를 확인하세요([AGENTS.md](AGENTS.md) 참고).

## 보안

배정이나 판정 결과가 노출되는 문제, 인증 우회 같은 취약점은 공개 이슈로 올리지 말고 GitHub의 [비공개 취약점 신고](https://github.com/park-gwimong/manito-web/security/advisories/new)로 알려 주세요.

## 라이선스

[MIT](LICENSE)
