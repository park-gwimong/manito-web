import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { MISSION_MODES } from "../domain/mission-plan";

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const EVENT_STATUSES = ["preparing", "active", "closed", "revealed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  startsAt: tz("starts_at").notNull(),
  endsAt: tz("ends_at").notNull(),
  /** 한 사람이 받는 미션 수. 매일·이틀 방식에서는 일정에서 계산한 값을 저장해 둔다. */
  missionCount: integer("mission_count").notNull(),
  /** 미션을 보내는 방식. 이 열이 생기기 전의 이벤트는 custom(개수를 기간에 고르게)이다. */
  missionMode: text("mission_mode", { enum: MISSION_MODES }).notNull().default("custom"),
  /** 매일·이틀 방식에서 미션이 도착하는 시각(한국 시간, 0~23). */
  missionHour: integer("mission_hour").notNull().default(9),
  status: text("status", { enum: EVENT_STATUSES }).notNull().default("preparing"),
  startMissedAt: tz("start_missed_at"),
  presentationStartedAt: tz("presentation_started_at"),
  /** 샘플 이벤트를 만든 시각. 값이 있으면 둘러보기용 샘플이고, 실제 이벤트는 항상 null이다. */
  demoSeededAt: tz("demo_seeded_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pinHash: text("pin_hash"),
    isOrganizer: boolean("is_organizer").notNull().default(false),
    pinResetAt: tz("pin_reset_at"),
    /** 마지막으로 PIN이 초기화된 시각. 지우지 않는다(이 시각 이전에 발급된 세션은 무효). */
    lastPinResetAt: tz("last_pin_reset_at"),
    failedPinAttempts: integer("failed_pin_attempts").notNull().default(0),
    pinLockedUntil: tz("pin_locked_until"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("participants_event_name_unique").on(t.eventId, t.name)],
);

export const assignments = pgTable("assignments", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  giverId: uuid("giver_id").notNull().unique().references(() => participants.id, { onDelete: "cascade" }),
  receiverId: uuid("receiver_id").notNull().unique().references(() => participants.id, { onDelete: "cascade" }),
  /** 진행 중에 참가자가 빠져 대상이 바뀐 시각. 처음 배정 그대로면 null. */
  reassignedAt: tz("reassigned_at"),
});

export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const verdicts = pgTable("verdicts", {
  recordId: uuid("record_id").primaryKey().references(() => records.id, { onDelete: "cascade" }),
  isMine: boolean("is_mine").notNull(),
  decidedAt: tz("decided_at").notNull().defaultNow(),
});

export const reactions = pgTable(
  "reactions",
  {
    recordId: uuid("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
  },
  (t) => [primaryKey({ columns: [t.recordId, t.participantId, t.emoji] })],
);

export const secretDeeds = pgTable("secret_deeds", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  giverId: uuid("giver_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const missionTemplates = pgTable("mission_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
});

export const missionDeliveries = pgTable(
  "mission_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    slotIndex: integer("slot_index").notNull(),
    deliveredAt: tz("delivered_at").notNull(),
    completedAt: tz("completed_at"),
  },
  (t) => [unique("mission_deliveries_participant_slot_unique").on(t.participantId, t.slotIndex)],
);

export const guesses = pgTable("guesses", {
  participantId: uuid("participant_id").primaryKey().references(() => participants.id, { onDelete: "cascade" }),
  guessedId: uuid("guessed_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
});

export const NOTIFICATION_KINDS = ["started", "mission", "record", "closed", "presentation", "reassigned"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** 보낼 알림을 쌓아 두는 곳. 도메인이 일이 생긴 그 트랜잭션에서 넣고, 보내는 쪽이 꺼내 가며 지운다. */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

/** 참가자가 알림을 켠 브라우저. 한 브라우저가 여러 이벤트에 쓰일 수 있어 (참가자, 주소) 쌍이 고유하다. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("push_subscriptions_participant_endpoint_unique").on(t.participantId, t.endpoint)],
);

export type Event = typeof events.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type DbRecord = typeof records.$inferSelect;
export type Verdict = typeof verdicts.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type SecretDeed = typeof secretDeeds.$inferSelect;
export type MissionTemplate = typeof missionTemplates.$inferSelect;
export type MissionDelivery = typeof missionDeliveries.$inferSelect;
export type Guess = typeof guesses.$inferSelect;
