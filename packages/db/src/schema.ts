import { createId } from "@paralleldrive/cuid2";
import {
  bigint,
  boolean,
  foreignKey,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import { lifecycleDates } from "./util/lifecycle-dates";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 128 })
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    clerkId: varchar("clerkId", { length: 128 }).notNull(),
    email: varchar("email", { length: 64 }).notNull(),
    ...lifecycleDates,
  },
  (table) => [index("clerk_id_idx").on(table.clerkId)]
);

export const chats = mysqlTable("chats", {
  id: varchar("id", { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey()
    .notNull(),
  title: text("title").notNull(),
  userId: varchar("userId", { length: 128 })
    .notNull()
    .references(() => users.id),
  visibility: varchar("visibility", { length: 32, enum: ["public", "private"] })
    .notNull()
    .default("private"),
  metadata: json("metadata"),
  ...lifecycleDates,
});

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey()
    .notNull(),
  chatId: varchar("chatId", { length: 128 })
    .notNull()
    .references(() => chats.id),
  role: varchar("role", { length: 32 }).notNull(),
  content: json("content").notNull(),
  parts: json("parts"),
  ...lifecycleDates,
});

export const votes = mysqlTable(
  "votes",
  {
    chatId: varchar("chatId", { length: 128 })
      .notNull()
      .references(() => chats.id),
    messageId: varchar("messageId", { length: 128 })
      .notNull()
      .references(() => messages.id),
    isUpvoted: boolean("isUpvoted").notNull(),
    ...lifecycleDates,
  },
  (table) => [primaryKey({ columns: [table.chatId, table.messageId] })]
);

export const documents = mysqlTable(
  "documents",
  {
    id: varchar("id", { length: 128 })
      .$defaultFn(() => createId())
      .notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("kind", {
      length: 32,
      enum: ["text", "code", "image", "sheet"],
    })
      .notNull()
      .default("text"),
    userId: varchar("userId", { length: 128 })
      .notNull()
      .references(() => users.id),
    ...lifecycleDates,
  },
  (table) => [primaryKey({ columns: [table.id, table.createdAt] })]
);

export const suggestions = mysqlTable(
  "suggestions",
  {
    id: varchar("id", { length: 128 })
      .$defaultFn(() => createId())
      .notNull(),
    documentId: varchar("documentId", { length: 128 }).notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: varchar("userId", { length: 128 })
      .notNull()
      .references(() => users.id),
    ...lifecycleDates,
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      name: "suggestions_doc_fk",
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [documents.id, documents.createdAt],
    }),
  ]
);

export const mastraWorkflowSnapshots = mysqlTable(
  "mastra_workflow_snapshot",
  {
    id: varchar("id", { length: 128 })
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    workflowName: varchar("workflow_name", { length: 255 }).notNull(),
    runId: varchar("run_id", { length: 255 }).notNull(),
    snapshot: text("snapshot").notNull(),
    ...lifecycleDates,
  },
  (table) => [
    unique("workflow_name_run_id_unique").on(table.workflowName, table.runId),
  ]
);

export const mastraEvals = mysqlTable("mastra_evals", {
  id: varchar("id", { length: 128 })
    .$defaultFn(() => createId())
    .primaryKey()
    .notNull(),
  input: text("input").notNull(),
  output: text("output").notNull(),
  result: json("result").notNull(),
  agentName: text("agent_name").notNull(),
  metricName: text("metric_name").notNull(),
  instructions: text("instructions").notNull(),
  testInfo: json("test_info"),
  globalRunId: text("global_run_id").notNull(),
  runId: text("run_id").notNull(),
  createdAt: lifecycleDates.createdAt,
});

export const mastraThreads = mysqlTable(
  "mastra_threads",
  {
    id: varchar("id", { length: 128 }).primaryKey().notNull(),
    resourceId: varchar("resourceId", { length: 255 }).notNull(),
    title: text("title").notNull(),
    metadata: text("metadata"),
    ...lifecycleDates,
  },
  (table) => [index("resource_id_idx").on(table.resourceId)]
);

export const mastraMessages = mysqlTable("mastra_messages", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  threadId: varchar("thread_id", { length: 128 })
    .notNull()
    .references(() => mastraThreads.id),
  content: text("content").notNull(),
  role: text("role").notNull(),
  type: text("type").notNull(),
  createdAt: lifecycleDates.createdAt,
});

export const mastraTraces = mysqlTable("mastra_traces", {
  id: varchar("id", { length: 128 }).primaryKey().notNull(),
  parentSpanId: text("parentSpanId"),
  name: text("name").notNull(),
  traceId: text("traceId").notNull(),
  scope: text("scope").notNull(),
  kind: int("kind").notNull(),
  attributes: json("attributes"),
  status: json("status"),
  events: json("events"),
  links: json("links"),
  other: text("other"),
  startTime: bigint("startTime", { mode: "bigint" }).notNull(),
  endTime: bigint("endTime", { mode: "bigint" }).notNull(),
  ...lifecycleDates,
});
