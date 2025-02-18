import { openai } from "@ai-sdk/openai";
import { getAuth } from "@clerk/tanstack-start/server";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { streamText, tool } from "ai";
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
