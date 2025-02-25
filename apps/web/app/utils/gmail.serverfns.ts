import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/start";
import {
  archiveEmail,
  ArchiveEmailInput,
  ArchiveEmailOutput,
  fetchEmails,
  FetchEmailsInput,
  FetchEmailsOutput,
} from "./gmail";

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

export const fetchEmailsQueryOptions = ({
  googleToken,
  query,
  maxResults,
  nextPageToken,
}: FetchEmailsInput) =>
  queryOptions({
    queryKey: ["fetchEmails", googleToken, query, maxResults, nextPageToken],
    queryFn: () =>
      fetchEmailsFn({
        data: { googleToken, query, maxResults, nextPageToken },
      }),
  });

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
