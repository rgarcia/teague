// import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { getAuth } from "@clerk/tanstack-start/server";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
// import { DefaultStorage, DefaultVectorDB } from "@mastra/core/storage";
import { createTool } from "@mastra/core/tools";
// import { Memory } from "@mastra/memory";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import {
  convertToCoreMessages,
  CoreMessage,
  CoreSystemMessage,
  Message,
  StepResult,
} from "ai";
import type { ChatPromptClient } from "langfuse";
// import { voyage } from "voyage-ai-provider";
import {
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from "~/lib/utils";
import { getChat } from "~/utils/chats";
import { clerk } from "~/utils/clerk";
import { langfuse, langfuseExporter } from "~/utils/langfuse";
import { saveMessages } from "~/utils/messages";
import registry from "~/utils/tools/all-tools";
import { getUser } from "~/utils/users";

let systemPrompt: ChatPromptClient;

// for some reason this is causing multiple unrelated tool calls to be made (e.g. getnextemail while creating a draft to the current email)
// const memory = new Memory({
//   embedder: voyage("voyage-3-large"),
//   storage: new DefaultStorage({
//     config: {
//       url: "file:memory.db",
//     },
//   }),
//   vector: new DefaultVectorDB({
//     connectionUrl: "file:vector.db",
//   }),
//   // https://mastra.ai/blog/using-ai-sdk-with-mastra#1-agent-memory
//   options: {
//     lastMessages: 6,
//     // semanticRecall: {
//     //   messageRange: 1,
//     //   topK: 3,
//     // },
//     workingMemory: {
//       enabled: true,
//       template: `<preferred-name></preferred-name>
//         <preferred-draft-tone></preferred-draft-tone>
//         <preferred-draft-guidance></preferred-draft-guidance>`,
//     },
//   },
// });

const mastra = new Mastra({
  agents: {
    cannon: new Agent({
      // TODO: understand this a bit better before turning it on
      // memory,
      name: "Cannon",
      instructions: "", // we will set this in context at generation time
      model: openai("gpt-4o"),
    }),
  },
  telemetry: {
    serviceName: "ai",
    export: {
      type: "custom",
      exporter: langfuseExporter,
    },
  },
});

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
      const systemPromptMessage: CoreSystemMessage = {
        role: "system",
        content: systemPromptText,
      };

      const { userId: clerkUserId } = await getAuth(request);
      if (!clerkUserId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const [clerkUser, clerkRes] = await Promise.all([
        clerk.users.getUser(clerkUserId),
        clerk.users.getUserOauthAccessToken(clerkUserId, "google"),
      ]);
      const googleToken = clerkRes.data[0].token;

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
      }: { id: string; messages: Array<Message>; selectedChatModel: string } =
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
      const userMessage: Message = getMostRecentUserMessage(messages);

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
      const res = await mastra.getAgent("cannon").stream([], {
        context: [systemPromptMessage, ...coreMessages],
        toolsets: { "this-name-doesnt-matter": tools },
        resourceId: clerkUserId,
        // threadId,
        onFinish: async (result) => {
          try {
            const stepResult = JSON.parse(result) as StepResult<any>;
            const { response } = stepResult;
            const toSave = sanitizeResponseMessages({
              chatId: id,
              messages: response.messages,
            });
            await saveMessages({
              messages: toSave,
            });
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
