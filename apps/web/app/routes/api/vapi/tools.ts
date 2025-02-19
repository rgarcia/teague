import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import type { Vapi } from "@vapi-ai/server-sdk";
import { acceptInviteConfig } from "~/tools/accept-invite";
import { archiveEmailConfig } from "~/tools/archive-email";
import { filterSenderConfig } from "~/tools/filter-sender";
import { nextEmailConfig } from "~/tools/next-email";
import { unsubscribeConfig } from "~/tools/unsubscribe";
import { clerk, getUserIdFromClerkJwt } from "~/utils/clerk";
import {
  ToolRegistryManager,
  type RequestContext,
} from "~/utils/tools/registry";

// Create and populate the registry
const registry = new ToolRegistryManager();
registry.registerTool(acceptInviteConfig);
registry.registerTool(archiveEmailConfig);
registry.registerTool(filterSenderConfig);
registry.registerTool(nextEmailConfig);
registry.registerTool(unsubscribeConfig);

type VapiResponse = ReturnType<typeof json<Vapi.ServerMessageResponse>>;

export function createErrorResponse(
  message: string,
  status: number
): ReturnType<typeof json<Vapi.ServerMessageResponse>> {
  return json(
    {
      messageResponse: {
        results: [],
        error: message,
      },
    },
    { status }
  );
}

export const APIRoute = createAPIFileRoute("/api/vapi/tools")({
  POST: async ({ request }): Promise<VapiResponse> => {
    try {
      const vapiSecret = request.headers.get("x-vapi-secret");
      if (!vapiSecret) {
        return createErrorResponse("No token provided", 401);
      }

      const userId = await getUserIdFromClerkJwt(vapiSecret);
      if (!userId) {
        return createErrorResponse(
          "Invalid token in x-vapi-secret header",
          401
        );
      }

      const clerkRes = await clerk.users.getUserOauthAccessToken(
        userId,
        "google"
      );
      const googleToken = clerkRes.data[0].token;

      const msg = (await request.json()) as Vapi.ServerMessage;
      if (msg.message.type !== "tool-calls") {
        return createErrorResponse(
          `Invalid message type ${msg.message.type}`,
          400
        );
      }

      const toolCalls = msg.message.toolCallList;
      const results: Vapi.ToolCallResult[] = [];
      const context: RequestContext = {
        googleToken,
      };
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") {
          console.log(
            `Warning: Tool call is not a function: ${JSON.stringify(toolCall)}`
          );
          continue;
        }

        try {
          const tool = registry.getTool(toolCall.function.name);
          const parseResult = tool.parameters.safeParse(
            toolCall.function.arguments
          );

          if (!parseResult.success) {
            results.push({
              name: tool.name,
              toolCallId: toolCall.id,
              error: `Invalid arguments: ${parseResult.error.message}`,
            });
            continue;
          }

          const result = await tool.execute(parseResult.data, context);
          results.push({
            name: tool.name,
            toolCallId: toolCall.id,
            result: JSON.stringify(result),
          });
        } catch (error) {
          results.push({
            name: toolCall.function.name,
            toolCallId: toolCall.id,
            error: `Tool execution failed: ${error}`,
          });
        }
      }

      const response: Vapi.ServerMessageResponse = {
        messageResponse: { results },
      };
      return json(response);
    } catch (error) {
      return createErrorResponse(`Server error: ${error}`, 500);
    }
  },
});
