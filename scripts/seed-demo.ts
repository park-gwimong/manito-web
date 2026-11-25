/**
 * 샘플 이벤트 추가: `yarn seed:demo <preparing|active|closed|revealed>`
 *
 * DATABASE_URL의 DB에 6명짜리 이벤트를 하나 만든다. 내용은 `src/dev/demo-seed.ts` 참고.
 * (DATABASE_URL 없이 `yarn dev`를 쓰는 경우에는 개발 서버가 내장 DB에 샘플을 알아서 넣으므로 이 스크립트가 필요 없다.)
 */
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "../src/db/client";
import { DEMO_PIN, DEMO_STAGES, seedDemo, type DemoStage } from "../src/dev/demo-seed";

// .env가 있으면 읽는다. 이미 설정된 환경변수는 덮어쓰지 않는다.
try {
  process.loadEnvFile(".env");
} catch {
  // .env가 없으면 셸의 환경변수를 쓴다.
}

async function main() {
  const stage = process.argv[2] as DemoStage | undefined;
  if (!stage || !DEMO_STAGES.includes(stage)) {
    console.error(`사용법: yarn seed:demo <${DEMO_STAGES.join("|")}>`);
    process.exit(1);
  }
  const db = getDb();
  // 서비스 시작 때와 같은 마이그레이션. 이미 적용되어 있으면 아무 일도 하지 않는다.
  await migrate(db as Parameters<typeof migrate>[0], {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  const { event, members } = await seedDemo(db, stage);

  console.log(`\n샘플 이벤트를 만들었어요. (단계: ${stage})`);
  console.log(`초대 링크 경로: /e/${event.code}`);
  console.log(`참가자 (PIN은 모두 ${DEMO_PIN}):`);
  for (const m of members) console.log(`  - ${m.name}${m.isOrganizer ? " (개설자)" : ""}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
