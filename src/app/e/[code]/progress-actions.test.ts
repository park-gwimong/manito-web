import { beforeEach, describe, expect, test, vi } from "vitest";
import { DomainError } from "@/domain/errors";

const records = vi.hoisted(() => ({
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  toggleReaction: vi.fn(),
  setVerdict: vi.fn(),
  addSecretDeed: vi.fn(),
  deleteSecretDeed: vi.fn(),
}));
const missions = vi.hoisted(() => ({ completeMission: vi.fn() }));
const viewer = vi.hoisted(() => ({ requireMe: vi.fn() }));

vi.mock("@/domain/records", () => records);
vi.mock("@/domain/missions", () => missions);
vi.mock("@/lib/viewer", () => ({
  requireMe: viewer.requireMe,
  requireEvent: vi.fn(),
  requireMember: vi.fn(),
  setSession: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => "DB" }));
vi.mock("@/domain/participants", () => ({
  acknowledgePinReset: vi.fn(),
  joinEvent: vi.fn(),
  loginWithPin: vi.fn(),
  setNewPin: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/push", () => ({ flushNotifications: vi.fn() }));
vi.mock("@/domain/lifecycle", () => ({ changeEndsAt: vi.fn(), closeNow: vi.fn(), startNow: vi.fn() }));
vi.mock("@/domain/notifications", () => ({ removeSubscription: vi.fn(), saveSubscription: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import {
  addSecretDeedAction,
  completeMissionAction,
  createRecordAction,
  deleteRecordAction,
  deleteSecretDeedAction,
  setVerdictAction,
  toggleReactionAction,
  updateRecordAction,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  viewer.requireMe.mockResolvedValue({ event: { id: "e1" }, me: { id: "p1" } });
});

describe("진행 화면 Server Action", () => {
  test("기록 작성은 로그인한 참가자 id와 현재 시각으로 도메인을 부른다", async () => {
    records.createRecord.mockResolvedValue({ id: "r1" });
    await expect(createRecordAction("ABCD", "안녕")).resolves.toEqual({ ok: true });
    expect(viewer.requireMe).toHaveBeenCalledWith("ABCD");
    expect(records.createRecord).toHaveBeenCalledWith("DB", "p1", "안녕", expect.any(Date));
  });

  test("수정·삭제·반응·판정·미션·몰래한일이 모두 me.id를 넘긴다", async () => {
    await updateRecordAction("ABCD", "r1", "새 글");
    await deleteRecordAction("ABCD", "r1");
    await toggleReactionAction("ABCD", "r1", "👍");
    await setVerdictAction("ABCD", "r1", true);
    await completeMissionAction("ABCD", "d1");
    await addSecretDeedAction("ABCD", "커피");
    await deleteSecretDeedAction("ABCD", "s1");
    expect(records.updateRecord).toHaveBeenCalledWith("DB", "p1", "r1", "새 글", expect.any(Date));
    expect(records.deleteRecord).toHaveBeenCalledWith("DB", "p1", "r1", expect.any(Date));
    expect(records.toggleReaction).toHaveBeenCalledWith("DB", "p1", "r1", "👍", expect.any(Date));
    expect(records.setVerdict).toHaveBeenCalledWith("DB", "p1", "r1", true, expect.any(Date));
    expect(missions.completeMission).toHaveBeenCalledWith("DB", "p1", "d1", expect.any(Date));
    expect(records.addSecretDeed).toHaveBeenCalledWith("DB", "p1", "커피", expect.any(Date));
    expect(records.deleteSecretDeed).toHaveBeenCalledWith("DB", "p1", "s1", expect.any(Date));
  });

  test("판정 값이 불리언이 아니면 도메인을 부르지 않는다", async () => {
    // @ts-expect-error 직접 POST로 들어온 잘못된 값
    const result = await setVerdictAction("ABCD", "r1", "true");
    expect(result.ok).toBe(false);
    expect(records.setVerdict).not.toHaveBeenCalled();
  });

  test("도메인 오류는 한국어 메시지로 돌려준다", async () => {
    records.createRecord.mockRejectedValue(new DomainError("DAILY", "내용을 입력해 주세요."));
    await expect(createRecordAction("ABCD", "")).resolves.toEqual({ ok: false, error: "내용을 입력해 주세요." });
  });

  test("로그인하지 않았으면 도메인을 부르지 않는다", async () => {
    viewer.requireMe.mockRejectedValue(new DomainError("NOT_LOGGED_IN", "다시 입장해 주세요."));
    await expect(completeMissionAction("ABCD", "d1")).resolves.toEqual({ ok: false, error: "다시 입장해 주세요." });
    expect(missions.completeMission).not.toHaveBeenCalled();
  });
});
