import type { gmail_v1 } from "@googleapis/gmail";
import { createServerFn } from "@tanstack/start";
import { gmailClientForToken, sanitizeForSummary } from "./gmail";

export type Email = {
  raw: gmail_v1.Schema$Message;
  summary: string;
};

export type FetchEmails = {
  googleToken: string;
  query: string;
  maxResults: number;
};

export const fetchEmails = createServerFn({ method: "GET" })
  .validator((input: unknown): FetchEmails => {
    return input as FetchEmails;
  })
  .handler(
    async ({ data: { googleToken, query, maxResults } }): Promise<Email[]> => {
      const gmailClient = gmailClientForToken(googleToken);

      // First, list the emails
      const listRes = await gmailClient.users.messages.list({
        userId: "me",
        q: query,
        maxResults: maxResults,
      });

      // Then fetch full details for each email
      const emails = await Promise.all(
        (listRes.data.messages || []).map(async (message) => {
          const fullEmail = await gmailClient.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "full",
          });
          const summary = await sanitizeForSummary(fullEmail.data, gmailClient);
          return {
            raw: fullEmail.data,
            summary,
          };
        })
      );

      return emails;
    }
  );

export type ArchiveEmail = {
  googleToken: string;
  messageId: string;
};

export const archiveEmail = createServerFn({ method: "POST" })
  .validator((input: unknown): ArchiveEmail => {
    return input as ArchiveEmail;
  })
  .handler(async ({ data: { googleToken, messageId } }): Promise<void> => {
    const gmailClient = gmailClientForToken(googleToken);
    const response = await gmailClient.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });
    if (response.status !== 200) {
      throw new Error(
        `Failed to archive email: ${response.status} ${response.data}`
      );
    }
  });
