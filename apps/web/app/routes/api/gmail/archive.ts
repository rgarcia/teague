import { json } from "@tanstack/start";
import { createAPIFileRoute } from "@tanstack/start/api";
import { gmail } from "../../../utils/gmail";

interface ArchiveRequest {
  messageId: string;
}

export const APIRoute = createAPIFileRoute("/api/gmail/archive")({
  POST: async ({ request }) => {
    try {
      const { messageId } = (await request.json()) as ArchiveRequest;

      const res = await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          removeLabelIds: ["INBOX"],
        },
      });

      if (res.status !== 200) {
        throw new Error(`Failed to archive message: ${res.statusText}`);
      }
      console.log(`Message ${messageId} archived successfully`);
      return json({ success: true });
    } catch (error) {
      console.error("Error archiving email:", error);
      return json({ error: "Failed to archive the email" }, { status: 500 });
    }
  },
});
