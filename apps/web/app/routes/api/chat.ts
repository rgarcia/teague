import { google } from "@ai-sdk/google";
import { getAuth } from "@clerk/tanstack-start/server";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { streamText, tool } from "ai";
import type { ChatPromptClient } from "langfuse";
import { clerk } from "~/utils/clerk";
import { langfuse } from "~/utils/langfuse";
import registry from "~/utils/tools/all-tools";

let systemPrompt: ChatPromptClient;

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

      const { userId } = await getAuth(request);
      if (!userId) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const [user, clerkRes] = await Promise.all([
        clerk.users.getUser(userId),
        clerk.users.getUserOauthAccessToken(userId, "google"),
      ]);
      const googleToken = clerkRes.data[0].token;
      const { messages } = await request.json();
      if (messages.find((m: any) => m.role === "system")) {
        console.log("DEBUG UNEXPECTED SYSTEM MESSAGE in messages");
      }
      const result = streamText({
        // @ts-ignore type error here for whatever reason
        model: google("gemini-2.0-flash"),
        system: systemPrompt.compile().find((p) => p.role === "system")
          ?.content,
        messages,
        maxRetries: 5,
        maxSteps: 10,
        onStepFinish: (stepResult) => {
          console.log("DEBUG stepResult", JSON.stringify(stepResult, null, 2));
        },
        tools: Object.fromEntries(
          registry.getAllTools().map((t) => {
            return [
              t.name,
              tool({
                description: t.description,
                parameters: t.parameters,
                execute: async (params) => {
                  try {
                    const result = await t.execute(params, {
                      googleToken,
                      user,
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
        ),
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            langfusePrompt: systemPrompt.toJSON(),
            userId,
          },
        },
      });
      return result.toDataStreamResponse();
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      return json(
        { error: `Internal server error: ${error}` },
        { status: 500 }
      );
    }
  },
});
