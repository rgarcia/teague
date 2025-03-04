import TTLCache from "@isaacs/ttlcache";
import { z } from "zod";
import {
  fetchEmails,
  gmailClientForToken,
  parseGmailEmail,
  type FetchEmailsOutput,
} from "~/utils/gmail";
import { tokeninfo } from "~/utils/tokeninfo";
import type { BaseToolConfig } from "~/utils/tools/registry";

// Create a cache with a 5-minute TTL
const emailCache = new TTLCache<string, FetchEmailsOutput>({
  ttl: 1000 * 60 * 5, // 5 minutes
});

// Helper to generate a consistent cache key
const generateCacheKey = (
  googleToken: string,
  query: string,
  maxResults: number
): string => {
  return `${googleToken}-${query}-${maxResults}`;
};

// Helper to prefetch the next page of emails
const prefetchNextPage = async (
  googleToken: string,
  query: string,
  nextPageToken?: string,
  maxResults: number = 1
) => {
  if (!nextPageToken) return;

  try {
    const cacheKey = generateCacheKey(googleToken, query, maxResults);

    // Prefetch the next page
    const response = await fetchEmails({
      googleToken,
      maxResults,
      query,
      nextPageToken,
    });

    if (response && response.emails) {
      // Store in cache
      emailCache.set(cacheKey, response);
    }
  } catch (error) {
    // Silently fail on prefetch errors - this is a background operation
    console.error("Error prefetching next page:", error);
  }
};

export const nextEmailSchema = z.object({
  query: z.string().describe("The email query to use. E.g., 'in:inbox'"),
  nextPageToken: z
    .string()
    .describe("The next page token to use for pagination")
    .optional(),
});
export type NextEmailInput = z.infer<typeof nextEmailSchema>;

export type NextEmailOutput =
  | {
      id: string;
      nextPageToken?: string;
      content: string;
    }
  | {
      done: true;
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
      nextPageToken: {
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
      let response;
      const maxResults = 1;
      const cacheKey = generateCacheKey(context.googleToken, query, maxResults);

      // Check if we have prefetched results in the cache for this request
      if (nextPageToken && emailCache.has(cacheKey)) {
        response = emailCache.get(cacheKey);
        // Remove from cache once used
        emailCache.delete(cacheKey);
      } else {
        // Fetch from API if not in cache
        response = await fetchEmails({
          googleToken: context.googleToken,
          maxResults,
          query,
          nextPageToken,
        });
      }

      if (!response) {
        throw new Error(`unexpected response from fetchEmails: ${response}`);
      }
      const { emails, nextPageToken: nextPageTokenFromFetch } = response;
      if (emails.length === 0) {
        return { done: true };
      }

      const email = emails[0];

      // Get user's email address for determining sent status
      const info = await tokeninfo(context.googleToken);
      const userEmail = info.email;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }

      const parsedEmail = await parseGmailEmail(
        email,
        gmailClientForToken(context.googleToken),
        userEmail
      );

      // Prefetch next page in the background if we have a nextPageToken
      if (nextPageTokenFromFetch) {
        prefetchNextPage(
          context.googleToken,
          query,
          nextPageTokenFromFetch,
          maxResults
        );
      }

      return {
        id: email.id ?? "",
        nextPageToken: nextPageTokenFromFetch,
        content: parsedEmail.llmFormatted,
      };
    } catch (error) {
      console.error("Error in GetNextEmail tool:", error);
      throw new Error(
        `Failed to get next email: ${
          error instanceof Error ? error.message : String(error)
        }`
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
