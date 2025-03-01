import { EvalRow } from "@mastra/core";
import { MessageType, StorageThreadType } from "@mastra/core/memory";
import {
  MastraStorage,
  StorageColumn,
  StorageGetMessagesArg,
  TABLE_EVALS,
  TABLE_MESSAGES,
  TABLE_NAMES,
  TABLE_THREADS,
  TABLE_TRACES,
  TABLE_WORKFLOW_SNAPSHOT,
} from "@mastra/core/storage";
import {
  db,
  eq,
  inArray,
  mastraEvals,
  mastraMessages,
  mastraThreads,
  mastraTraces,
  mastraWorkflowSnapshots,
} from "db";

export class MySQLStorage extends MastraStorage {
  constructor() {
    super({ name: `CustomMySQLStorage` });
  }

  async createTable(_: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    // tables created out of band (drizzle)
    return;
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db.delete(mastraWorkflowSnapshots);
          break;
        case TABLE_MESSAGES:
          await db.delete(mastraMessages);
          break;
        case TABLE_THREADS:
          await db.delete(mastraThreads);
          break;
        case TABLE_TRACES:
          await db.delete(mastraTraces);
          break;
        case TABLE_EVALS:
          await db.delete(mastraEvals);
          break;
        default:
          throw new Error(`clearTable error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`clearTable error: ${error}`);
    }
  }

  async insert({
    tableName,
    record,
  }: {
    tableName: TABLE_NAMES;
    record: Record<string, any>;
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db.insert(mastraWorkflowSnapshots).values(record as any);
          break;
        case TABLE_MESSAGES:
          await db.insert(mastraMessages).values(record as any);
          break;
        case TABLE_THREADS:
          await db.insert(mastraThreads).values(record as any);
          break;
        case TABLE_TRACES:
          await db.insert(mastraTraces).values(record as any);
          break;
        case TABLE_EVALS:
          await db.insert(mastraEvals).values(record as any);
          break;
        default:
          throw new Error(`insert error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`insert error: ${error}`);
    }
  }

  async batchInsert({
    tableName,
    records,
  }: {
    tableName: TABLE_NAMES;
    records: Record<string, any>[];
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db.insert(mastraWorkflowSnapshots).values(records as any);
          break;
        case TABLE_MESSAGES:
          await db.insert(mastraMessages).values(records as any);
          break;
        case TABLE_THREADS:
          await db.insert(mastraThreads).values(records as any);
          break;
        case TABLE_TRACES:
          await db.insert(mastraTraces).values(records as any);
          break;
        case TABLE_EVALS:
          await db.insert(mastraEvals).values(records as any);
          break;
      }
    } catch (error) {
      throw new Error(`batchInsert error: ${error}`);
    }
  }

  async get({
    tableName,
    id,
  }: {
    tableName: TABLE_NAMES;
    id: string;
  }): Promise<Record<string, any> | null> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          const workflowSnapshot = await db
            .select()
            .from(mastraWorkflowSnapshots)
            .where(eq(mastraWorkflowSnapshots.id, id));
          return workflowSnapshot[0] || null;
        case TABLE_MESSAGES:
          const messages = await db
            .select()
            .from(mastraMessages)
            .where(eq(mastraMessages.id, id));
          return messages[0] || null;
        case TABLE_THREADS:
          const threads = await db
            .select()
            .from(mastraThreads)
            .where(eq(mastraThreads.id, id));
          return threads[0] || null;
        case TABLE_TRACES:
          const traces = await db
            .select()
            .from(mastraTraces)
            .where(eq(mastraTraces.id, id));
          return traces[0] || null;
        case TABLE_EVALS:
          const evals = await db
            .select()
            .from(mastraEvals)
            .where(eq(mastraEvals.id, id));
          return evals[0] || null;
      }
    } catch (error) {
      throw new Error(`get error: ${error}`);
    }
  }

  async getAll({
    tableName,
  }: {
    tableName: TABLE_NAMES;
  }): Promise<Record<string, any>[]> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          const workflowSnapshots = await db
            .select()
            .from(mastraWorkflowSnapshots);
          return workflowSnapshots;
        case TABLE_MESSAGES:
          const messages = await db.select().from(mastraMessages);
          return messages;
        case TABLE_THREADS:
          const threads = await db.select().from(mastraThreads);
          return threads;
        case TABLE_TRACES:
          const traces = await db.select().from(mastraTraces);
          return traces;
        case TABLE_EVALS:
          const evals = await db.select().from(mastraEvals);
          return evals;
        default:
          throw new Error(`getAll error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`getAll error: ${error}`);
    }
  }

  async getMany({
    tableName,
    ids,
  }: {
    tableName: TABLE_NAMES;
    ids: string[];
  }): Promise<Record<string, any>[]> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          const workflowSnapshots = await db
            .select()
            .from(mastraWorkflowSnapshots)
            .where(inArray(mastraWorkflowSnapshots.id, ids));
          return workflowSnapshots;
        case TABLE_MESSAGES:
          const messages = await db
            .select()
            .from(mastraMessages)
            .where(inArray(mastraMessages.id, ids));
          return messages;
        case TABLE_THREADS:
          const threads = await db
            .select()
            .from(mastraThreads)
            .where(inArray(mastraThreads.id, ids));
          return threads;
        case TABLE_TRACES:
          const traces = await db
            .select()
            .from(mastraTraces)
            .where(inArray(mastraTraces.id, ids));
          return traces;
        case TABLE_EVALS:
          const evals = await db
            .select()
            .from(mastraEvals)
            .where(inArray(mastraEvals.id, ids));
          return evals;
        default:
          throw new Error(`getMany error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`getMany error: ${error}`);
    }
  }

  async query({
    tableName,
    query,
  }: {
    tableName: TABLE_NAMES;
    query: Record<string, any>;
  }): Promise<Record<string, any>[]> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          const workflowSnapshots = await db
            .select()
            .from(mastraWorkflowSnapshots)
            .where(eq(mastraWorkflowSnapshots.id, query.id));
          return workflowSnapshots;
        case TABLE_MESSAGES:
          const messages = await db
            .select()
            .from(mastraMessages)
            .where(eq(mastraMessages.id, query.id));
          return messages;
        case TABLE_THREADS:
          const threads = await db
            .select()
            .from(mastraThreads)
            .where(eq(mastraThreads.id, query.id));
          return threads;
        case TABLE_TRACES:
          const traces = await db
            .select()
            .from(mastraTraces)
            .where(eq(mastraTraces.id, query.id));
          return traces;
        case TABLE_EVALS:
          const evals = await db
            .select()
            .from(mastraEvals)
            .where(eq(mastraEvals.id, query.id));
          return evals;
        default:
          throw new Error(`query error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`query error: ${error}`);
    }
  }

  async update({
    tableName,
    id,
    record,
  }: {
    tableName: TABLE_NAMES;
    id: string;
    record: Record<string, any>;
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db
            .update(mastraWorkflowSnapshots)
            .set(record)
            .where(eq(mastraWorkflowSnapshots.id, id));
          break;
        case TABLE_MESSAGES:
          await db
            .update(mastraMessages)
            .set(record)
            .where(eq(mastraMessages.id, id));
          break;
        case TABLE_THREADS:
          await db
            .update(mastraThreads)
            .set(record)
            .where(eq(mastraThreads.id, id));
          break;
        case TABLE_TRACES:
          await db
            .update(mastraTraces)
            .set(record)
            .where(eq(mastraTraces.id, id));
          break;
        case TABLE_EVALS:
          await db
            .update(mastraEvals)
            .set(record)
            .where(eq(mastraEvals.id, id));
          break;
        default:
          throw new Error(`update error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`update error: ${error}`);
    }
  }

  async upsert({
    tableName,
    id,
    record,
  }: {
    tableName: TABLE_NAMES;
    id: string;
    record: Record<string, any>;
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db
            .insert(mastraWorkflowSnapshots)
            .values(record as any)
            .onDuplicateKeyUpdate({
              set: record,
            });
          break;
        case TABLE_MESSAGES:
          await db
            .insert(mastraMessages)
            .values(record as any)
            .onDuplicateKeyUpdate({
              set: record,
            });
          break;
        case TABLE_THREADS:
          await db
            .insert(mastraThreads)
            .values(record as any)
            .onDuplicateKeyUpdate({
              set: record,
            });
          break;
        case TABLE_TRACES:
          await db
            .insert(mastraTraces)
            .values(record as any)
            .onDuplicateKeyUpdate({
              set: record,
            });
          break;
        case TABLE_EVALS:
          await db
            .insert(mastraEvals)
            .values(record as any)
            .onDuplicateKeyUpdate({
              set: record,
            });
          break;
        default:
          throw new Error(`upsert error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`upsert error: ${error}`);
    }
  }

  async delete({
    tableName,
    id,
  }: {
    tableName: TABLE_NAMES;
    id: string;
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db
            .delete(mastraWorkflowSnapshots)
            .where(eq(mastraWorkflowSnapshots.id, id));
          break;
        case TABLE_MESSAGES:
          await db.delete(mastraMessages).where(eq(mastraMessages.id, id));
          break;
        case TABLE_THREADS:
          await db.delete(mastraThreads).where(eq(mastraThreads.id, id));
          break;
        case TABLE_TRACES:
          await db.delete(mastraTraces).where(eq(mastraTraces.id, id));
          break;
        case TABLE_EVALS:
          await db.delete(mastraEvals).where(eq(mastraEvals.id, id));
          break;
        default:
          throw new Error(`delete error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`delete error: ${error}`);
    }
  }

  async deleteMany({
    tableName,
    ids,
  }: {
    tableName: TABLE_NAMES;
    ids: string[];
  }): Promise<void> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          await db
            .delete(mastraWorkflowSnapshots)
            .where(inArray(mastraWorkflowSnapshots.id, ids));
          break;
        case TABLE_MESSAGES:
          await db
            .delete(mastraMessages)
            .where(inArray(mastraMessages.id, ids));
          break;
        case TABLE_THREADS:
          await db.delete(mastraThreads).where(inArray(mastraThreads.id, ids));
          break;
        case TABLE_TRACES:
          await db.delete(mastraTraces).where(inArray(mastraTraces.id, ids));
          break;
        case TABLE_EVALS:
          await db.delete(mastraEvals).where(inArray(mastraEvals.id, ids));
          break;
        default:
          throw new Error(`deleteMany error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`deleteMany error: ${error}`);
    }
  }

  async tableExists({
    tableName,
  }: {
    tableName: TABLE_NAMES;
  }): Promise<boolean> {
    try {
      switch (tableName) {
        case TABLE_WORKFLOW_SNAPSHOT:
          const workflowSnapshots = await db
            .select()
            .from(mastraWorkflowSnapshots)
            .limit(1);
          return workflowSnapshots.length > 0;
        case TABLE_MESSAGES:
          const messages = await db.select().from(mastraMessages).limit(1);
          return messages.length > 0;
        case TABLE_THREADS:
          const threads = await db.select().from(mastraThreads).limit(1);
          return threads.length > 0;
        case TABLE_TRACES:
          const traces = await db.select().from(mastraTraces).limit(1);
          return traces.length > 0;
        case TABLE_EVALS:
          const evals = await db.select().from(mastraEvals).limit(1);
          return evals.length > 0;
        default:
          throw new Error(`tableExists error: unknown table ${tableName}`);
      }
    } catch (error) {
      throw new Error(`tableExists error: ${error}`);
    }
  }

  async close(): Promise<void> {
    return;
  }

  async load<R>({
    tableName,
    keys,
  }: {
    tableName: TABLE_NAMES;
    keys: Record<string, string>;
  }): Promise<R | null> {
    throw new Error("load() not implemented");
  }

  async getThreadById({
    threadId,
  }: {
    threadId: string;
  }): Promise<StorageThreadType | null> {
    console.log(`DEBUG CustomStorage getThreadById threadId=${threadId}`);
    try {
      const threads = await db
        .select()
        .from(mastraThreads)
        .where(eq(mastraThreads.id, threadId));
      if (threads.length === 0) {
        return null;
      }
      const thread = threads[0];
      return {
        id: thread.id,
        title: thread.title,
        resourceId: thread.resourceId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt || thread.createdAt,
        metadata:
          typeof thread.metadata === "string"
            ? JSON.parse(thread.metadata)
            : {},
      };
    } catch (error) {
      throw new Error(`getThreadById error: ${error}`);
    }
  }

  async getThreadsByResourceId({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<StorageThreadType[]> {
    console.log(
      `DEBUG CustomStorage getThreadsByResourceId resourceId=${resourceId}`
    );
    try {
      const threads = await db
        .select()
        .from(mastraThreads)
        .where(eq(mastraThreads.resourceId, resourceId));
      if (threads.length === 0) {
        return [];
      }
      return threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        resourceId: thread.resourceId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt || thread.createdAt,
        metadata:
          typeof thread.metadata === "string"
            ? JSON.parse(thread.metadata)
            : {},
      }));
    } catch (error) {
      throw new Error(`getThreadsByResourceId error: ${error}`);
    }
  }

  async saveThread({
    thread,
  }: {
    thread: StorageThreadType;
  }): Promise<StorageThreadType> {
    console.log(`DEBUG CustomStorage saveThread thread.id=${thread?.id}`);

    try {
      const metadata = thread.metadata ? JSON.stringify(thread.metadata) : null;
      await db
        .insert(mastraThreads)
        .values({
          id: thread.id,
          title: thread.title || "Untitled chat",
          resourceId: thread.resourceId,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt || thread.createdAt,
          metadata: metadata,
        })
        .onDuplicateKeyUpdate({
          set: {
            title: thread.title || "Untitled Chat",
            resourceId: thread.resourceId,
            updatedAt: thread.updatedAt || new Date(),
            metadata: metadata,
          },
        });
      return thread;
    } catch (error) {
      console.error("Failed to save thread in database:", error);
      throw error;
    }
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    console.log(`DEBUG CustomStorage updateThread id=${id}`);
    try {
      await db
        .update(mastraThreads)
        .set({ title, metadata: JSON.stringify(metadata) })
        .where(eq(mastraThreads.id, id));
      const thread = await this.getThreadById({ threadId: id });
      if (!thread) {
        throw new Error(`updateThread error: thread not found`);
      }
      return thread;
    } catch (error) {
      throw new Error(`updateThread error: ${error}`);
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    console.log(`DEBUG CustomStorage deleteThread threadId=${threadId}`);
    try {
      await db.delete(mastraThreads).where(eq(mastraThreads.id, threadId));
    } catch (error) {
      throw new Error(`deleteThread error: ${error}`);
    }
  }

  async getMessagesByThreadId({
    threadId,
    limit,
    before,
  }: {
    threadId: string;
    limit?: number;
    before?: string;
  }): Promise<MessageType[]> {
    console.log(
      `DEBUG CustomStorage getMessagesByThreadId threadId=${threadId} limit=${limit} before=${before}`
    );
    try {
      const messages = await db
        .select()
        .from(mastraMessages)
        .where(eq(mastraMessages.threadId, threadId));
      return messages.map((message) => ({
        id: message.id,
        role: message.role as "system" | "user" | "assistant" | "tool",
        content: message.content,
        createdAt: message.createdAt,
        threadId,
        type: message.type as "text" | "tool-call" | "tool-result",
      }));
    } catch (error) {
      throw new Error(`getMessagesByThreadId error: ${error}`);
    }
  }

  async getMessages({
    threadId,
    selectBy,
    threadConfig,
  }: StorageGetMessagesArg): Promise<MessageType[]> {
    console.log(
      `DEBUG CustomStorage getMessages threadId=${threadId} selectBy=${JSON.stringify(
        selectBy
      )}`
    );
    try {
      // Get ALL messages for this thread first, sorted by creation time
      const allThreadMessages = await db
        .select()
        .from(mastraMessages)
        .where(eq(mastraMessages.threadId, threadId))
        .orderBy(mastraMessages.createdAt);

      if (allThreadMessages.length === 0) {
        return [];
      }

      // Create a set to track which messages should be included
      const messagesToIncludeIds = new Set<string>();

      // Add messages based on the 'last' parameter
      const last = typeof selectBy?.last === "number" ? selectBy.last : 40;
      if (last > 0 && allThreadMessages.length > 0) {
        // Get the last N messages
        const startIdx = Math.max(0, allThreadMessages.length - last);
        for (let i = startIdx; i < allThreadMessages.length; i++) {
          messagesToIncludeIds.add(allThreadMessages[i].id);
        }
      }

      // Process the 'include' array if it exists
      const include = selectBy?.include || [];
      if (include.length > 0) {
        // Create a map of message indices for quick lookups
        const messageIndices = new Map<string, number>();
        allThreadMessages.forEach((msg, idx) => {
          messageIndices.set(msg.id, idx);
        });

        // For each included ID, add the ID itself and its context messages
        for (const item of include) {
          // Add the specifically requested message
          messagesToIncludeIds.add(item.id);

          const idx = messageIndices.get(item.id);
          if (idx !== undefined) {
            // Add previous messages
            const prevCount = item.withPreviousMessages || 0;
            for (let i = 1; i <= prevCount; i++) {
              const prevIdx = idx - i;
              if (prevIdx >= 0) {
                messagesToIncludeIds.add(allThreadMessages[prevIdx].id);
              }
            }

            // Add next messages
            const nextCount = item.withNextMessages || 0;
            for (let i = 1; i <= nextCount; i++) {
              const nextIdx = idx + i;
              if (nextIdx < allThreadMessages.length) {
                messagesToIncludeIds.add(allThreadMessages[nextIdx].id);
              }
            }
          }
        }
      }

      // Filter the messages to only include those in our set
      const filteredMessages = allThreadMessages.filter((msg) =>
        messagesToIncludeIds.has(msg.id)
      );

      // Convert to the expected return format
      const messages = filteredMessages.map((msg) => ({
        id: msg.id,
        threadId: msg.threadId,
        content:
          typeof msg.content === "string"
            ? tryParseJSON(msg.content)
            : msg.content,
        role: msg.role as "system" | "user" | "assistant" | "tool",
        type: msg.type as "text" | "tool-call" | "tool-result",
        createdAt: msg.createdAt,
      }));
      return messages;
    } catch (error) {
      throw new Error(`getMessages error: ${error}`);
    }
  }

  async saveMessages({
    messages,
  }: {
    messages: MessageType[];
  }): Promise<MessageType[]> {
    console.log(
      `DEBUG CustomStorage saveMessages messages.length=${messages.length}`
    );
    if (messages.length === 0) return messages;
    try {
      const threadId = messages[0]?.threadId;
      if (!threadId) {
        throw new Error("Thread ID is required");
      }
      const thread = await this.getThreadById({ threadId });
      if (!thread) {
        throw new Error(`Thread ${threadId} not found`);
      }
      await db.insert(mastraMessages).values(
        messages.map((msg) => ({
          id: msg.id,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
          role: msg.role,
          threadId,
          type: msg.type,
          createdAt: msg.createdAt,
        }))
      );
      return messages;
    } catch (error) {
      throw new Error(`saveMessages error: ${error}`);
    }
  }

  async getWorkingMemory({
    threadId,
  }: {
    threadId: string;
  }): Promise<Record<string, unknown> | null> {
    console.log(`DEBUG CustomStorage getWorkingMemory threadId=${threadId}`);
    throw new Error("Method not implemented: getWorkingMemory");
  }

  async saveWorkingMemory({
    threadId,
    memoryData,
  }: {
    threadId: string;
    memoryData: Record<string, unknown>;
  }): Promise<void> {
    console.log(`DEBUG CustomStorage saveWorkingMemory threadId=${threadId}`);
    throw new Error("Method not implemented: saveWorkingMemory");
  }

  async getResourceSummary({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<Record<string, unknown> | null> {
    console.log(
      `DEBUG CustomStorage getResourceSummary resourceId=${resourceId}`
    );
    throw new Error("Method not implemented: getResourceSummary");
  }

  async saveResourceSummary({
    resourceId,
    summary,
  }: {
    resourceId: string;
    summary: Record<string, unknown>;
  }): Promise<void> {
    console.log(
      `DEBUG CustomStorage saveResourceSummary resourceId=${resourceId}`
    );
    throw new Error("Method not implemented: saveResourceSummary");
  }

  async getTraces({
    name,
    scope,
    page,
    perPage,
    attributes,
  }: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
  }): Promise<any[]> {
    console.log(
      `DEBUG CustomStorage getTraces name=${name} scope=${scope} page=${page} perPage=${perPage}`
    );
    throw new Error("Method not implemented: getTraces");
  }

  async getEvalsByAgentName(
    agentName: string,
    type?: "test" | "live"
  ): Promise<EvalRow[]> {
    console.log(
      `DEBUG CustomStorage getEvalsByAgentName agentName=${agentName} type=${type}`
    );
    throw new Error("Method not implemented: getEvalsByAgentName");
  }
}

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
