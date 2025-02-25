import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import * as schema from "./schema";

// Select Types
export type User = InferSelectModel<typeof schema.users>;
export type Chat = InferSelectModel<typeof schema.chats>;
export type Message = InferSelectModel<typeof schema.messages>;
export type Vote = InferSelectModel<typeof schema.votes>;
export type Document = InferSelectModel<typeof schema.documents>;
export type Suggestion = InferSelectModel<typeof schema.suggestions>;

// Insert Types
export type NewUser = InferInsertModel<typeof schema.users>;
export type NewChat = InferInsertModel<typeof schema.chats>;
export type NewMessage = InferInsertModel<typeof schema.messages>;
export type NewVote = InferInsertModel<typeof schema.votes>;
export type NewDocument = InferInsertModel<typeof schema.documents>;
export type NewSuggestion = InferInsertModel<typeof schema.suggestions>;

// Zod Schemas
export const userInsertSchema = createInsertSchema(schema.users);
export const userSelectSchema = createSelectSchema(schema.users);

export const chatInsertSchema = createInsertSchema(schema.chats);
export const chatSelectSchema = createSelectSchema(schema.chats);

export const messageInsertSchema = createInsertSchema(schema.messages);
export const messageSelectSchema = createSelectSchema(schema.messages);

export const voteInsertSchema = createInsertSchema(schema.votes);
export const voteSelectSchema = createSelectSchema(schema.votes);

export const documentInsertSchema = createInsertSchema(schema.documents);
export const documentSelectSchema = createSelectSchema(schema.documents);

export const suggestionInsertSchema = createInsertSchema(schema.suggestions);
export const suggestionSelectSchema = createSelectSchema(schema.suggestions);
