import type { gmail_v1 } from "@googleapis/gmail";
import { createServerFn } from "@tanstack/start";
import { gmailClientForToken } from "./gmail";

export type FetchEmailsInput = {
  googleToken: string;
  query: string;
  maxResults: number;
  nextPageToken?: string;
};

export type FetchEmailsOutput = {
  emails: gmail_v1.Schema$Message[];
  nextPageToken?: string;
};

export async function fetchEmails(
  input: FetchEmailsInput
): Promise<FetchEmailsOutput> {
  const gmailClient = gmailClientForToken(input.googleToken);
  const listRes = await gmailClient.users.messages.list({
    userId: "me",
    q: input.query,
    maxResults: input.maxResults,
    pageToken: input.nextPageToken,
  });

  if (!listRes.data) {
    return {
      emails: [],
    };
  }

  const emails: gmail_v1.Schema$Message[] = await Promise.all(
    (listRes.data.messages || []).map(async (message) => {
      const fullEmail = await gmailClient.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });
      return fullEmail.data;
    })
  );

  return {
    emails: emails,
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

export const fetchEmailsFn = createServerFn({ method: "GET" })
  .validator((input: unknown): FetchEmailsInput => {
    return input as FetchEmailsInput;
  })
  .handler(
    async ({
      data: { googleToken, query, maxResults, nextPageToken },
    }): Promise<FetchEmailsOutput> => {
      return await fetchEmails({
        googleToken,
        query,
        maxResults,
        nextPageToken,
      });
    }
  );

export type ArchiveEmailInput = {
  googleToken: string;
  messageId: string;
};

export type ArchiveEmailOutput = void;

export async function archiveEmail(
  input: ArchiveEmailInput
): Promise<ArchiveEmailOutput> {
  const gmailClient = gmailClientForToken(input.googleToken);
  const response = await gmailClient.users.messages.modify({
    userId: "me",
    id: input.messageId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
  if (response.status !== 200) {
    throw new Error(
      `Failed to archive email: ${response.status} ${response.data}`
    );
  }
}

export const archiveEmailFn = createServerFn({ method: "POST" })
  .validator((input: unknown): ArchiveEmailInput => {
    return input as ArchiveEmailInput;
  })
  .handler(
    async ({
      data: { googleToken, messageId },
    }): Promise<ArchiveEmailOutput> => {
      await archiveEmail({ googleToken, messageId });
    }
  );
