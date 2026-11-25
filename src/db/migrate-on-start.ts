import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./client";

/** 운영 서버 시작 시 `drizzle/`의 마이그레이션을 적용한다. */
export async function migrateOnStart(): Promise<void> {
  await migrate(getDb() as Parameters<typeof migrate>[0], {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("[migrate] 마이그레이션을 적용했어요.");
}
