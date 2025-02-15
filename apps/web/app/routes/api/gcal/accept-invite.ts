import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import type { Vapi } from "@vapi-ai/server-sdk";
import { z } from "zod";
import { acceptInvite } from "~/utils/gcal.serverfns";
import { archiveEmail } from "~/utils/gmail.serverfns";
import { createErrorResponse, validateVapiRequest } from "~/utils/vapi";

const config = {
  endpoint: "/api/gcal/accept-invite",
  toolName: "AcceptInvite",
  parameters: z.object({
    messageId: z
      .string()
      .describe("The ID of the message containing the invite"),
    eventId: z.string().describe("The ID of the event to accept"),
  }),
  response: z.object({
    success: z.boolean(),
  }),
};

export const APIRoute = createAPIFileRoute(config.endpoint)({
  POST: async ({ request }) => {
    try {
      const validationResult = await validateVapiRequest(request);
      if (validationResult instanceof Response) {
        return validationResult;
      }
      const { toolCalls } = validationResult;
      console.log("toolCalls", JSON.stringify(toolCalls, null, 2));
      const results: Vapi.ToolCallResult[] = [];
      for (const toolCall of toolCalls) {
        if (
          toolCall.type !== "function" ||
          toolCall.function.name !== config.toolName
        ) {
          continue;
        }

        const parseResult = config.parameters.safeParse(
          toolCall.function.arguments
        );
        if (!parseResult.success) {
          results.push({
            name: config.toolName,
            toolCallId: toolCall.id,
            error: `Invalid arguments: ${parseResult.error.message}`,
          });
          continue;
        }

        const { messageId, eventId } = parseResult.data;

        try {
          await Promise.all([
            archiveEmail({
              data: {
                googleToken: validationResult.googleToken,
                messageId,
              },
            }),
            acceptInvite({
              data: {
                googleToken: validationResult.googleToken,
                eventId,
              },
            }),
          ]);
          results.push({
            name: config.toolName,
            toolCallId: toolCall.id,
            result: JSON.stringify({ success: true }),
          });
        } catch (error) {
          results.push({
            name: config.toolName,
            toolCallId: toolCall.id,
            error: `Failed to accept invite: ${error}`,
          });
        }
      }
      return json({
        messageResponse: { results },
      });
    } catch (error) {
      return createErrorResponse(`Server error: ${error}`, 500);
    }
  },
});
