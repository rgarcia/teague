import { createId } from "@paralleldrive/cuid2";
import {
  boolean,
  foreignKey,
  index,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
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
