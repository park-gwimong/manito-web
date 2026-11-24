import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// 운영(node-postgres)과 테스트(PGlite) 드라이버 모두에 맞는 공통 DB 타입.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let instance: Db | undefined;

/** DATABASE_URL로 연결한 싱글턴. import 시점이 아니라 첫 호출 때 연결한다. */
export function getDb(): Db {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 환경 변수가 설정되지 않았습니다.");
    instance = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return instance;
}
