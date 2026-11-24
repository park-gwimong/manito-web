# 마니또

5~10명 모임이 며칠 동안 서로의 마니또가 되어 보는 웹 서비스입니다. Next.js(App Router) + PostgreSQL(Drizzle ORM)로 만들었고, NCP 서버 한 대에 Docker로 배포하도록 구성했습니다.

## 로컬 실행

1. DB를 띄웁니다.

   ```bash
   cp .env.example .env     # 값을 채운다 (아래 환경변수 표 참고)
   docker compose up db -d
   ```

   `docker compose`는 `.env`의 `POSTGRES_PASSWORD`가 필요합니다. 로컬에서 앱(`yarn dev`)이 DB에 접속하려면 db 컨테이너의 5432 포트가 호스트로 열려 있어야 하는데, 배포용 `docker-compose.yml`은 보안상 포트를 공개하지 않습니다. 로컬 개발용으로는 별도 파일을 만들어 함께 쓰세요.

   ```yaml
   # docker-compose.local.yml (커밋하지 않기)
   services:
     db:
       ports:
         - "127.0.0.1:5432:5432"
   ```

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up db -d
   ```

   이미 로컬에 PostgreSQL이 있다면 그것을 써도 됩니다. `.env`의 `DATABASE_URL`만 맞추세요.

2. 의존성을 설치하고 개발 서버를 실행합니다. (yarn 1.x 사용)

   ```bash
   yarn install
   yarn dev
   ```

   개발 서버(`yarn dev`)는 직접 실행합니다. 개발 모드에서는 마이그레이션이 자동으로 돌지 않으므로, 처음에는 `yarn seed:demo preparing`처럼 데모 데이터를 한 번 만들어 테이블을 준비하세요(데모 스크립트가 마이그레이션을 먼저 적용합니다).

## 테스트와 타입 검사

```bash
yarn test            # 도메인 테스트 (PGlite, 별도 DB 불필요)
yarn next typegen    # 새로 clone했다면 먼저 실행 (또는 yarn build)
yarn tsc --noEmit
```

`PageProps`, `LayoutProps` 같은 라우트 타입은 `yarn next typegen`(또는 빌드)이 만들어 줍니다. 새로 clone한 직후에 `tsc`만 실행하면 이 타입을 찾지 못해 실패합니다.

## 데모 데이터

```bash
yarn seed:demo <단계>      # preparing | active | closed | revealed
```

프로젝트 루트의 `.env`를 읽어 `DATABASE_URL`의 DB에 만듭니다. 필요하면 마이그레이션을 먼저 적용하고, 6명(민지 · 준호 · 서연 · 도윤 · 하은 · 지우)이 참여한 이벤트를 요청한 단계까지 진행시켜 만듭니다. 실제 서비스와 같은 도메인 함수만 사용하고 과거 시각을 넘겨 시간이 흐른 것처럼 만듭니다. 끝나면 초대 링크 경로(`/e/<코드>`)와 참가자 이름이 출력되고, **PIN은 모두 `0000`** 입니다.

| 단계 | 상태 |
| --- | --- |
| `preparing` | 시작 전. 참가자 6명이 로비에 모여 있음 |
| `active` | 3일 전에 시작해 4일 뒤 끝남. 기록, 반응, 판정, 몰래 한 일, 완료한 미션이 쌓여 있음 |
| `closed` | 어제 마감됨. 마니또 추측까지 끝났고 발표 대기 중 (개설자 민지로 발표 시작 가능) |
| `revealed` | 발표까지 끝난 결과 화면 |

권장 확인 순서: `yarn seed:demo active`와 `yarn seed:demo closed`를 실행한 뒤 `yarn dev`로 접속해, 출력된 경로로 들어가 이름과 PIN `0000`으로 입장하여 진행 화면과 발표 화면을 직접 눌러 봅니다. 실행할 때마다 새 이벤트가 추가됩니다.

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `DATABASE_URL` | 앱이 접속할 PostgreSQL 주소. Docker Compose에서는 `POSTGRES_*` 값으로 자동 구성되어 이 값을 덮어씁니다. |
| `SESSION_SECRET` | 세션 쿠키 서명 키. **길고 무작위인 문자열**이어야 합니다. `openssl rand -base64 48` 로 만드세요. 바꾸면 모든 사용자가 로그아웃됩니다. |
| `ADMIN_PASSWORD` | 관리용 비밀번호 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose가 만드는 DB 설정. 비밀번호는 URL에 들어가므로 영문·숫자만 쓰세요 (`openssl rand -hex 24`). |
| `APP_PORT` | 호스트에 공개할 앱 포트 (기본 `3000`) |

## NCP 배포

1. **서버 생성** — NCP 콘솔에서 Ubuntu 서버(1 vCPU / 2GB 이상)를 만들고 공인 IP를 붙입니다.
2. **Docker 설치** — 서버에 접속해 Docker Engine과 Compose 플러그인을 설치합니다. ([공식 설치 문서](https://docs.docker.com/engine/install/ubuntu/))
3. **ACG에서 80/443 열기** — 서버에 연결된 ACG(방화벽)의 인바운드에 TCP 80, 443을 허용합니다. SSH(22)는 관리하는 IP로 제한하세요. 3000과 5432는 열지 않습니다.
4. **`.env` 작성** — 서버에서 저장소를 clone하고 `.env.example`을 복사한 뒤, 비밀값 세 개를 **반드시 새로 만들어 교체**합니다. 이 페이지는 공개되고 `ADMIN_PASSWORD`가 `/new`(이벤트 개설)를 지키므로, `change-me` 같은 예시 값을 운영에 그대로 쓰면 안 됩니다. (`POSTGRES_PASSWORD`는 비어 있는 경우만 compose가 막으므로 `change-me`도 통과해 버립니다.)

   ```bash
   cp .env.example .env
   sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48)|" .env
   sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
   sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -hex 12)|" .env
   grep -n "change-me" .env    # 아무것도 나오지 않아야 합니다
   grep ADMIN_PASSWORD .env    # 개설할 때 쓸 비밀번호이니 따로 적어 두세요
   ```

   `DATABASE_URL`은 compose가 `POSTGRES_*`로 다시 만들므로 운영에서는 쓰이지 않습니다(`grep change-me`에 이 줄이 남아 나오는 것은 무시해도 됩니다). 직접 편집하려면 `SESSION_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_PASSWORD` 세 줄을 각각 원하는 강한 값으로 바꾸면 됩니다.

5. **실행** — 이미지를 빌드해 백그라운드로 띄웁니다. 앱은 시작할 때 마이그레이션을 먼저 적용하고, 실패하면 서버가 뜨지 않습니다(`docker compose logs app`으로 확인).

   ```bash
   docker compose up -d --build
   ```

   DB는 이름 있는 볼륨(`pgdata`)에 저장되며 외부로 포트를 공개하지 않습니다. 앱은 호스트의 3000 포트로 열립니다.

6. **리버스 프록시와 HTTPS (Caddy 권장)** — **세션 쿠키는 운영 환경에서 `secure` 속성이 붙으므로 반드시 HTTPS로 서비스해야 합니다.** 일반 HTTP로 접속하면 브라우저가 쿠키를 저장하지 않아 로그인이 오류 없이 조용히 실패합니다. 도메인을 서버 공인 IP로 연결한 뒤 Caddy를 설치하고(`apt install caddy`) `/etc/caddy/Caddyfile`을 다음처럼 작성합니다. 인증서는 Caddy가 자동으로 발급·갱신합니다.

   ```caddyfile
   manito.example.com {
       reverse_proxy localhost:3000
   }
   ```

   ```bash
   sudo systemctl reload caddy
   ```

7. **백업 (`pg_dump`)**

   ```bash
   # 백업
   docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > manito-$(date +%F).sql
   # 복원 (빈 DB에)
   docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < manito-2026-01-01.sql
   ```

   cron으로 매일 실행하고 서버 밖(오브젝트 스토리지 등)에 사본을 보관하세요.

업데이트는 `git pull && docker compose up -d --build` 입니다.
