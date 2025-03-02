import { google } from "@ai-sdk/google";
//import { openai } from "@ai-sdk/openai";
import { getAuth } from "@clerk/tanstack-start/server";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createLogger } from "@mastra/core/logger";
// import { DefaultStorage, DefaultVectorDB } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { convertToCoreMessages, CoreMessage, StepResult, UIMessage } from "ai";
import { ChatPromptClient } from "langfuse";
import { MySQLStorage } from "~/lib/mastra/mysqlStorage";
import { TurbopufferVector } from "~/lib/turbopuffer";
import {
  getMostRecentCoreUserMessage,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from "~/lib/utils";
import { getChat } from "~/utils/chats";
import { cachedGetUser } from "~/utils/clerk";
import { langfuse } from "~/utils/langfuse";
import { saveMessages } from "~/utils/messages";
import { cachedGoogleToken } from "~/utils/tokeninfo";
import registry from "~/utils/tools/all-tools";
import { getUser } from "~/utils/users";

let systemPrompt: ChatPromptClient;

const tpuf = new TurbopufferVector({
  apiKey: process.env.TURBOPUFFER_API_KEY!,
  baseUrl: "https://gcp-us-central1.turbopuffer.com",
  schemaConfigForIndex: (indexName: string) => {
    // mastra's default embedding model is fast embed with bge-small: https://github.com/mastra-ai/mastra/blob/69bec47a67c1a37500b50e52538f620e77f45f52/packages/core/src/vector/fastembed.ts#L115
    // this indexName and dimensions are set when mastra uses these defaults
    if (indexName === "memory_messages_384") {
      return {
        dimensions: 384,
        schema: {
          thread_id: {
            type: "string",
            filterable: true,
          },
        },
      };
    } else {
      throw new Error(`TODO: add schema for index: ${indexName}`);
    }
  },
});

const memory = new Memory({
  storage: new MySQLStorage() as any,
  vector: tpuf,
  // https://mastra.ai/blog/using-ai-sdk-with-mastra#1-agent-memory
  options: {
    lastMessages: 6,
    semanticRecall: {
      messageRange: 1,
      topK: 3,
    },
    workingMemory: {
      enabled: true,
      template: `<preferred-name></preferred-name>
        <preferred-draft-tone></preferred-draft-tone>
        <preferred-draft-guidance></preferred-draft-guidance>`,
    },
  },
});

let _mastra: Mastra | null = null;

function initMastra(cannonSystemMessage: string): Mastra {
  if (_mastra) {
    return _mastra;
  }
  _mastra = new Mastra({
    logger: createLogger({
      name: "Mastra",
      level: "debug",
    }),
    agents: {
      cannon: new Agent({
        memory,
        name: "Cannon",
        instructions: cannonSystemMessage,
        //model: openai("gpt-4o"),
        model: google("gemini-2.0-flash-001"),
      }),
    },
    telemetry: {
      // serviceName: "ai",
      // export: {
      //   type: "custom",
      //   exporter: langfuseExporter,
      // },
      serviceName: "ai",
      enabled: true,
      export: {
        type: "otlp",
      },
    },
  });
  return _mastra;
}

export const APIRoute = createAPIFileRoute("/api/chat")({
  POST: async ({ request, params }) => {
    try {
      // Initialize system prompt if not already done
      if (!systemPrompt) {
        systemPrompt = await langfuse.getPrompt("system-prompt", undefined, {
          label: "production",
          type: "chat",
        });
        if (systemPrompt.type !== "chat") {
          throw new Error("System prompt is not a chat prompt");
        }
      }
      const systemPromptText = systemPrompt
        .compile()
        .find((p) => p.role === "system")?.content;
      if (!systemPromptText) {
        throw new Error("Could not find system prompt");
      }

      const { userId: clerkUserId } = await getAuth(request);
      if (!clerkUserId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const [clerkUser, { token: googleToken }] = await Promise.all([
        cachedGetUser(clerkUserId),
        cachedGoogleToken(clerkUserId),
      ]);

      const user = await getUser({ clerkUserId });
      if (!user) {
        return json(
          { error: `User not found for Clerk ID ${clerkUserId}` },
          { status: 404 }
        );
      }

      const tools = Object.fromEntries(
        registry.getAllTools().map((t) => {
          return [
            t.name,
            createTool({
              id: t.name,
              description: t.description,
              inputSchema: t.parameters,
              execute: async ({ context: params, runId }) => {
                try {
                  const result = await t.execute(params, {
                    googleToken,
                    user: clerkUser,
                  });
                  return result;
                } catch (error) {
                  console.error("Error in tool execution:", error);
                  throw error;
                }
              },
            }),
          ];
        })
      );

      let {
        id,
        messages,
        selectedChatModel,
      }: { id: string; messages: Array<UIMessage>; selectedChatModel: string } =
        await request.json();

      // for some reason user messages are losing content field, so fix that
      messages = messages.map((m) => {
        if (m.role === "user" && !m.content) {
          if (m.parts?.length == 1 && m.parts[0].type === "text") {
            m.content = m.parts[0].text;
          } else {
            throw new Error(
              `User message is missing content: ${JSON.stringify(m)}`
            );
          }
        }
        return m;
      });

      const coreMessages: CoreMessage[] = convertToCoreMessages(messages);
      const userMessage: UIMessage = getMostRecentUserMessage(messages);
      const coreUserMessage: CoreMessage =
        getMostRecentCoreUserMessage(coreMessages);

      const chat = await getChat({ chatId: id });
      if (!chat) {
        throw new Error(`Chat not found for id ${id}`);
      }
      await saveMessages({
        messages: [
          {
            id: userMessage.id,
            role: "user",
            parts: userMessage.parts,
            // one day convertToCoreMessages will look at parts for user messages. until then we store as content string:
            content: userMessage.content,
            createdAt: new Date(),
            updatedAt: new Date(),
            chatId: id,
          },
        ],
      });

      //  Order of ops: instructions, ...context, ...memories, ...messages
      const res = await initMastra(systemPromptText)
        .getAgent("cannon")
        .stream([coreUserMessage], {
          toolsets: { "this-name-doesnt-matter": tools },
          resourceId: user.id,
          threadId: id,
          memoryOptions: {
            lastMessages: 6,
            semanticRecall: {
              messageRange: 1,
              topK: 3,
            },
            workingMemory: {
              enabled: true,
              template: `<preferred-name></preferred-name>
        <preferred-draft-tone></preferred-draft-tone>
        <preferred-draft-guidance></preferred-draft-guidance>`,
            },
          },
          onFinish: async (result) => {
            try {
              const stepResult = JSON.parse(result) as StepResult<any>;
              const { response } = stepResult;
              const toSave = sanitizeResponseMessages({
                chatId: id,
                messages: response.messages,
              });
              if (toSave.length > 0) {
                await saveMessages({
                  messages: toSave,
                });
              }
            } catch (error) {
              console.error("Error in onFinish:", error);
            }
          },
        });

      return res.toDataStreamResponse({
        getErrorMessage: (error) => {
          return `Internal server error: ${error}`;
        },
      });
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      return json(
        { error: `Internal server error: ${error}` },
        { status: 500 }
      );
    }
  },
});
