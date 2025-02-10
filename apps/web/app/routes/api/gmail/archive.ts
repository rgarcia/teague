import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import type { Vapi } from "@vapi-ai/server-sdk";
import { z } from "zod";
import { createErrorResponse, validateVapiRequest } from "../../../utils/vapi";

const config = {
  endpoint: "/api/gmail/archive",
  toolName: "ArchiveEmail",
  parameters: z.object({
    messageId: z.string().describe("The ID of the message to archive"),
  }),
  response: z.object({
    success: z.boolean(),
    messageId: z.string(),
  }),
};

type ArchiveEmailResponse = z.infer<typeof config.response>;

export const APIRoute = createAPIFileRoute(config.endpoint)({
  POST: async ({ request }) => {
    try {
      const validationResult = await validateVapiRequest(request);
      if (validationResult instanceof Response) {
        return validationResult;
      }
      const { gmail, toolCalls } = validationResult;

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

        const { messageId } = parseResult.data;

        try {
          const res = await gmail.users.messages.modify({
            userId: "me",
            id: messageId,
            requestBody: {
              removeLabelIds: ["INBOX"],
            },
          });

          if (res.status !== 200) {
            results.push({
              name: config.toolName,
              toolCallId: toolCall.id,
              error: `Failed to archive message: ${res.statusText}`,
            });
            continue;
          }

          const response: ArchiveEmailResponse = {
            success: true,
            messageId,
          };

          results.push({
            name: config.toolName,
            toolCallId: toolCall.id,
            result: JSON.stringify(response),
          });
        } catch (error) {
          results.push({
            name: config.toolName,
            toolCallId: toolCall.id,
            error: `Failed to archive message: ${error}`,
          });
        }
      }

      return json({
        messageResponse: { results },
      });
    } catch (error) {
      console.error("Error processing tool calls:", error);
      return createErrorResponse(`Failed to process tool calls: ${error}`, 500);
    }
  },
});
