/**
 * 개발 서버(`yarn dev`)가 뜰 때 한 번 실행된다. 운영 빌드에서는 불리지 않는다.
 *
 * - DATABASE_URL이 없으면 내장 DB(PGlite)를 `.local/pgdata`에 만들어 쓴다. Docker나 PostgreSQL 없이 바로 실행된다.
 * - 마이그레이션을 적용한다.
 * - 이벤트가 하나도 없으면 단계별 샘플 이벤트 4개를 넣는다. (DEV_SEED=0 이면 넣지 않는다)
 * - SESSION_SECRET, ADMIN_PASSWORD가 없으면 개발용 기본값을 쓴다.
 * - 알림용 VAPID 키가 없으면 만들어 `.local/vapid.json`에 둔다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb, setDb, type Db } from "../db/client";
import * as schema from "../db/schema";
import { DEMO_STAGES, seedDemo } from "./demo-seed";

export const DEV_ADMIN_PASSWORD = "admin";
const LOCAL_DB_DIR = path.join(".local", "pgdata");

/** 알림을 로컬에서도 시험할 수 있게, 키가 없으면 한 번 만들어 `.local/vapid.json`에 둔다. */
async function ensureDevVapidKeys(): Promise<void> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return;
  const file = path.join(process.cwd(), ".local", "vapid.json");
  let keys: { publicKey: string; privateKey: string };
  try {
    keys = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // CommonJS 모듈이라 번들러에 따라 default가 없을 수 있다.
    const mod = await import("web-push");
    keys = (mod.default ?? mod).generateVAPIDKeys();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(keys));
  }
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
}

export async function bootstrapDev(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;

  process.env.SESSION_SECRET ||= "dev-only-session-secret-do-not-use-in-production";
  process.env.ADMIN_PASSWORD ||= DEV_ADMIN_PASSWORD;
  await ensureDevVapidKeys();

  const migrationsFolder = path.join(process.cwd(), "drizzle");
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    db = getDb();
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
    console.log("[dev] DATABASE_URL의 DB를 씁니다.");
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dataDir = path.join(process.cwd(), LOCAL_DB_DIR);
    await mkdir(dataDir, { recursive: true });
    const local = drizzle(new PGlite(dataDir), { schema });
    await migrate(local, { migrationsFolder });
    db = local;
    setDb(db);
    console.log(`[dev] 내장 DB를 씁니다 (${LOCAL_DB_DIR}). 처음부터 다시 하려면 yarn dev:reset`);
  }

  if (process.env.DEV_SEED === "0") return;
  const [existing] = await db.select({ id: schema.events.id }).from(schema.events).limit(1);
  if (existing) return;

  console.log("[dev] 샘플 이벤트를 만드는 중…");
  for (const stage of DEMO_STAGES) await seedDemo(db, stage);
  console.log("[dev] 샘플 이벤트 4개를 만들었어요. http://localhost:3000/dev 에서 둘러보세요.");
}
