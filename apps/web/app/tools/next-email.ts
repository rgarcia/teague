import { z } from "zod";
import {
  fetchEmails,
  gmailClientForToken,
  parseGmailEmail,
} from "~/utils/gmail";
import type { BaseToolConfig } from "~/utils/tools/registry";

export const nextEmailSchema = z.object({
  query: z.string().describe("The email query to use. E.g., 'in:inbox'"),
  nextPageToken: z
    .string()
    .describe("The next page token to use for pagination")
    .optional(),
});
export type NextEmailInput = z.infer<typeof nextEmailSchema>;

export type NextEmailOutput = {
  id: string;
  nextPageToken?: string;
  content: string;
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
      console.log("FETCH EMAILS", { query, nextPageToken });
      const response = await fetchEmails({
        googleToken: context.googleToken,
        maxResults: 1,
        query,
        nextPageToken,
      });

      if (!response || !response.emails) {
        throw new Error(`unexpected response from fetchEmails: ${response}`);
      }
      const { emails, nextPageToken: nextPageTokenFromFetch } = response;
      if (emails.length === 0) {
        throw new Error("No emails found matching the query");
      }

      const email = emails[0];

      // Get user's email address for determining sent status
      const gmailClient = gmailClientForToken(context.googleToken);
      const profile = await gmailClient.users.getProfile({
        userId: "me",
      });
      const userEmail = profile.data.emailAddress;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }

      const parsedEmail = await parseGmailEmail(email, gmailClient, userEmail);

      return {
        id: email.id ?? "",
        nextPageToken: nextPageTokenFromFetch,
        content: parsedEmail.llmFormatted,
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
