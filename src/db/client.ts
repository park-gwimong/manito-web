import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

// 운영(node-postgres)과 테스트·로컬 개발(PGlite) 드라이버 모두에 맞는 공통 DB 타입.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

// 개발 서버는 모듈을 여러 번 다시 불러오므로 연결을 globalThis에 둔다.
const holder = globalThis as typeof globalThis & { __manitoDb?: Db };

/**
 * 앱이 쓰는 DB 싱글턴. import 시점이 아니라 첫 호출 때 연결한다.
 * 개발 서버가 내장 DB를 미리 넣어 두었으면(`setDb`) 그것을 쓰고, 아니면 DATABASE_URL로 연결한다.
 */
export function getDb(): Db {
  if (!holder.__manitoDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 환경 변수가 설정되지 않았습니다.");
    holder.__manitoDb = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return holder.__manitoDb;
}

/** 개발 서버 전용: 내장 DB를 앱의 DB로 쓴다. (`src/dev/bootstrap.ts`) */
export function setDb(db: Db): void {
  holder.__manitoDb = db;
}
