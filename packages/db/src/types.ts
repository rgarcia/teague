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
export type MastraWorkflowSnapshot = InferSelectModel<
  typeof schema.mastraWorkflowSnapshots
>;
export type MastraEval = InferSelectModel<typeof schema.mastraEvals>;
export type MastraThread = InferSelectModel<typeof schema.mastraThreads>;
export type MastraMessage = InferSelectModel<typeof schema.mastraMessages>;
export type MastraTrace = InferSelectModel<typeof schema.mastraTraces>;

// Insert Types
export type NewUser = InferInsertModel<typeof schema.users>;
export type NewChat = InferInsertModel<typeof schema.chats>;
export type NewMessage = InferInsertModel<typeof schema.messages>;
export type NewVote = InferInsertModel<typeof schema.votes>;
export type NewDocument = InferInsertModel<typeof schema.documents>;
export type NewSuggestion = InferInsertModel<typeof schema.suggestions>;
export type NewMastraWorkflowSnapshot = InferInsertModel<
  typeof schema.mastraWorkflowSnapshots
>;
export type NewMastraEval = InferInsertModel<typeof schema.mastraEvals>;
export type NewMastraThread = InferInsertModel<typeof schema.mastraThreads>;
export type NewMastraMessage = InferInsertModel<typeof schema.mastraMessages>;
export type NewMastraTrace = InferInsertModel<typeof schema.mastraTraces>;

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

export const mastraWorkflowSnapshotInsertSchema = createInsertSchema(
  schema.mastraWorkflowSnapshots
);
export const mastraWorkflowSnapshotSelectSchema = createSelectSchema(
  schema.mastraWorkflowSnapshots
);

export const mastraEvalInsertSchema = createInsertSchema(schema.mastraEvals);
export const mastraEvalSelectSchema = createSelectSchema(schema.mastraEvals);

export const mastraThreadInsertSchema = createInsertSchema(
  schema.mastraThreads
);
export const mastraThreadSelectSchema = createSelectSchema(
  schema.mastraThreads
);

export const mastraMessageInsertSchema = createInsertSchema(
  schema.mastraMessages
);
export const mastraMessageSelectSchema = createSelectSchema(
  schema.mastraMessages
);

export const mastraTraceInsertSchema = createInsertSchema(schema.mastraTraces);
export const mastraTraceSelectSchema = createSelectSchema(schema.mastraTraces);
