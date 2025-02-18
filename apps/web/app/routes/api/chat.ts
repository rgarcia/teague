import { openai } from "@ai-sdk/openai";
import { getAuth } from "@clerk/tanstack-start/server";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { streamText, tool } from "ai";
import Langfuse, { ChatPromptClient } from "langfuse";
import { acceptInviteConfig } from "~/tools/accept-invite";
import { archiveEmailConfig } from "~/tools/archive-email";
import { filterSenderConfig } from "~/tools/filter-sender";
import { nextEmailConfig } from "~/tools/next-email";
import { unsubscribeConfig } from "~/tools/unsubscribe";
import { clerk } from "~/utils/clerk";
import { ToolRegistryManager } from "~/utils/tools/registry";

// Create and populate the registry
const registry = new ToolRegistryManager();
registry.registerTool(acceptInviteConfig);
registry.registerTool(archiveEmailConfig);
registry.registerTool(filterSenderConfig);
registry.registerTool(nextEmailConfig);
registry.registerTool(unsubscribeConfig);

const langfuse = new Langfuse({
  baseUrl: process.env.LANGFUSE_BASE_URL,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
});

const systemPrompt: ChatPromptClient = await langfuse.getPrompt(
  "system-prompt",
  undefined,
  { label: "production", type: "chat" }
);
if (systemPrompt.type !== "chat") {
  throw new Error("System prompt is not a chat prompt");
}

export const APIRoute = createAPIFileRoute("/api/chat")({
  POST: async ({ request, params }) => {
    const { userId } = await getAuth(request);
    if (!userId) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const clerkRes = await clerk.users.getUserOauthAccessToken(
      userId,
      "google"
    );
    const googleToken = clerkRes.data[0].token;
    const { messages } = await request.json();

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt.compile().find((p) => p.role === "system")?.content,
      messages,
      maxSteps: 10,
      tools: Object.fromEntries(
        registry.getAllTools().map((t) => {
          return [
            t.name,
            tool({
              description: t.description,
              parameters: t.parameters,
              execute: async (params) => {
                const result = await t.execute(params, { googleToken });
                return result;
              },
            }),
          ];
        })
      ),
    });
    return result.toDataStreamResponse();
  },
});
