import path from "node:path";

/** 서버가 뜨기 전에 마이그레이션을 적용한다. 실패하면 오류를 던져 서버가 뜨지 않게 한다. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb } = await import("./db/client");
  await migrate(getDb() as Parameters<typeof migrate>[0], {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("[migrate] 마이그레이션을 적용했어요.");
}
