import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { gmail, sanitizeForSummary } from "../../../utils/gmail";

interface EmailQuery {
  userId: string;
  maxResults: number;
  q: string;
  pageToken?: string;
}

export const APIRoute = createAPIFileRoute("/api/gmail/next-email")({
  POST: async ({ request }) => {
    try {
      const query = (await request.json()) as EmailQuery;

      // Get the list of messages
      const res = await gmail.users.messages.list({
        userId: query.userId,
        maxResults: query.maxResults,
        q: query.q,
        pageToken: query.pageToken,
      });

      if (!res.data.messages || res.data.messages.length === 0) {
        return json({
          error: "No more emails to review in the inbox.",
        });
      }

      // Get the full message details
      const messageRes = await gmail.users.messages.get({
        userId: query.userId,
        id: res.data.messages[0].id!,
        format: "full",
      });

      return json({
        raw: messageRes.data,
        sanitizedContent: sanitizeForSummary(messageRes.data),
        nextPageToken: res.data.nextPageToken,
      });
    } catch (error) {
      console.error("Error fetching next email:", error);
      return json(
        { error: `Failed to fetch the next email: ${error}` },
        { status: 500 }
      );
    }
  },
});
