import { z } from "zod";
import { emailBodyToMarkdown, gmailClientForToken } from "~/utils/gmail";
import { fetchEmails } from "~/utils/gmail.serverfns";
import type { BaseToolConfig } from "~/utils/tools/registry";

const nextEmailSchema = z.object({
  query: z.string().describe("The email query to use. E.g., 'in:inbox'"),
  nextPageToken: z
    .string()
    .describe("The next page token to use for pagination")
    .optional(),
});

type NextEmailOutput = {
  id: string;
  nextPageToken?: string;
  content: {
    bcc: string;
    body: string;
    cc: string;
    contentType: string;
    date: string;
    from: string;
    references: string;
    replyTo: string;
    snippet: string;
    subject: string;
    threadId: string;
    to: string;
    unsubscribe: string;
  };
};

export const nextEmailConfig: BaseToolConfig<
  typeof nextEmailSchema,
  NextEmailOutput
> = {
  name: "GetNextEmail",
  description: "Gather the next email up for review from the user's inbox.",
  parameters: nextEmailSchema,
  vapiParameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The email query to use. E.g., 'in:inbox'",
      },
      nextToken: {
        type: "string",
        description: "The next page token to use for pagination",
      },
    },
    required: ["query"],
  },
  execute: async ({ query, nextPageToken }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }

    try {
      const response = await fetchEmails({
        data: {
          googleToken: context.googleToken,
          maxResults: 1,
          query,
          nextPageToken,
        },
      });

      if (!response || !response.emails) {
        throw new Error(`unexpected response from fetchEmails: ${response}`);
      }
      const { emails, nextPageToken: nextPageTokenFromFetch } = response;
      if (emails.length === 0) {
        throw new Error("No emails found matching the query");
      }

      const email = emails[0];
      const headers = email.payload?.headers || [];
      const getHeaderValue = (name: string) => {
        const value = headers.find(
          (h) => h.name?.toLowerCase() === name.toLowerCase()
        )?.value;
        return value ?? "";
      };

      return {
        id: email.id ?? "",
        nextPageToken: nextPageTokenFromFetch,
        content: {
          bcc: getHeaderValue("bcc"),
          body: await emailBodyToMarkdown(
            gmailClientForToken(context.googleToken),
            email
          ),
          cc: getHeaderValue("cc"),
          contentType: getHeaderValue("content-type"),
          date: getHeaderValue("date"),
          from: getHeaderValue("from"),
          references: getHeaderValue("references"),
          replyTo: getHeaderValue("reply-to"),
          snippet: email.snippet ?? "",
          subject: getHeaderValue("subject"),
          threadId: email.threadId ?? "",
          to: getHeaderValue("to"),
          unsubscribe: getHeaderValue("unsubscribe"),
        },
      };
    } catch (error) {
      console.error("Error in GetNextEmail tool:", error);
      throw new Error(
        `Failed to get next email: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  },
  messages: [
    {
      type: "request-start" as const,
      content: "",
    },
    {
      type: "request-failed" as const,
      content:
        "I couldn't get the email information right now, please try again later.",
    },
    {
      type: "request-response-delayed" as const,
      content:
        "It appears there is some delay in communication with the email API.",
      timingMilliseconds: 10000,
    },
  ],
};
