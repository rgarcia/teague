import type { gmail_v1 } from "@googleapis/gmail";
import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import type { Vapi } from "@vapi-ai/server-sdk";
import { z } from "zod";
import { sanitizeForSummary } from "../../../utils/gmail";
import { createErrorResponse, validateVapiRequest } from "../../../utils/vapi";

const config = {
  endpoint: "/api/gmail/next-email",
  toolName: "GetNextEmail",
  parameters: z.object({
    query: z.string().describe("The email query to use. E.g., 'in:inbox'"),
    maxResults: z
      .number()
      .int()
      .positive()
      .describe("The maximum number of emails to return"),
    pageToken: z
      .string()
      .optional()
      .describe("The next page token to use for pagination"),
  }),
  response: z.object({
    id: z.string(),
    content: z.object({
      subject: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      date: z.string().optional(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      replyTo: z.string().optional(),
      references: z.string().optional(),
      contentType: z.string().optional(),
      unsubscribe: z.string().optional(),
      body: z.string().optional(),
      snippet: z.string().optional(),
    }),
    nextPageToken: z.string().optional().nullable(),
  }),
};

type NextEmailResponse = z.infer<typeof config.response>;

const HEADER_MAPPING = {
  subject: "subject",
  from: "from",
  to: "to",
  date: "date",
  cc: "cc",
  bcc: "bcc",
  "reply-to": "replyTo",
  references: "references",
  "content-type": "contentType",
  unsubscribe: "unsubscribe",
} as const;

function extractEmailContent(message: gmail_v1.Schema$Message) {
  const headers = message.payload?.headers || [];
  const getHeaderValue = (name: string) => {
    const value = headers.find(
      (h: gmail_v1.Schema$MessagePartHeader) => h.name?.toLowerCase() === name
    )?.value;
    return value ?? undefined;
  };

  const content = {
    subject: getHeaderValue("subject"),
    from: getHeaderValue("from"),
    to: getHeaderValue("to"),
    date: getHeaderValue("date"),
    cc: getHeaderValue("cc"),
    bcc: getHeaderValue("bcc"),
    replyTo: getHeaderValue("reply-to"),
    references: getHeaderValue("references"),
    contentType: getHeaderValue("content-type"),
    unsubscribe: getHeaderValue("unsubscribe"),
    body: sanitizeForSummary(message),
    snippet: message.snippet ?? undefined,
  };
  return content;
}

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

        const { query, maxResults, pageToken } = parseResult.data;

        try {
          // Get the list of messages
          const res = await gmail.users.messages.list({
            userId: "me",
            maxResults,
            q: query,
            pageToken: pageToken,
          });

          if (!res.data.messages || res.data.messages.length === 0) {
            results.push({
              name: config.toolName,
              toolCallId: toolCall.id,
              error: "No more emails to review in the inbox.",
            });
            continue;
          }

          // Get the full message details
          const messageRes = await gmail.users.messages.get({
            userId: "me",
            id: res.data.messages[0].id!,
            format: "full",
          });

          const response: NextEmailResponse = {
            id: messageRes.data.id!,
            content: extractEmailContent(messageRes.data),
            nextPageToken: res.data.nextPageToken ?? undefined,
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
            error: `Failed to fetch email: ${error}`,
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
