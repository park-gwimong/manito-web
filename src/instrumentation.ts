/**
 * 서버가 뜨기 전에 한 번 실행된다.
 * - 운영: 마이그레이션을 적용한다. 실패하면 오류를 던져 서버가 뜨지 않게 한다.
 * - 개발: 내장 DB와 샘플 데이터를 준비한다(`src/dev/bootstrap.ts`).
 *
 * Node 전용 코드는 이 파일에 직접 두지 않고 아래에서 필요할 때 불러온다(Edge 런타임 경고 방지).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "development") {
    const { bootstrapDev } = await import("./dev/bootstrap");
    await bootstrapDev();
  } else if (process.env.NODE_ENV === "production") {
    const { migrateOnStart } = await import("./db/migrate-on-start");
    await migrateOnStart();
  } else {
    return;
  }

  // 아무도 접속하지 않아도 시작·마감·미션 배달이 제때 되고 알림이 나가도록 1분마다 점검한다.
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
