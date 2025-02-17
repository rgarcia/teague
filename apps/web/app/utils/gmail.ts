import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import TurndownService from "turndown";

export function gmailClientForToken(token: string): gmail_v1.Gmail {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return gmail({ version: "v1", auth });
}

// Helper function to sanitize email content for LLMs
export async function emailBodyToMarkdown(
  gmailClient: gmail_v1.Gmail,
  message: gmail_v1.Schema$Message
): Promise<string> {
  const turndownService = new TurndownService();

  // Figure out the best text representation of the email for the llm
  // Handle both multipart and non-multipart messages
  let content = "";

  // Case 1: Direct content in payload.body (non-multipart messages)
  if (message.payload?.body?.data) {
    try {
      const decodedContent = Buffer.from(
        message.payload.body.data,
        "base64"
      ).toString("utf-8");

      const contentType =
        message.payload?.headers
          ?.find((header) => header.name?.toLowerCase() === "content-type")
          ?.value?.toLowerCase() ?? "";

      content = contentType.includes("text/html")
        ? turndownService
            .remove(["script", "style", "title"])
            .turndown(decodedContent)
        : decodedContent;
    } catch (error) {
      console.warn("Failed to decode base64 data from payload.body:", error);
    }
  }
  // Case 2: Multipart messages in payload.parts
  else if (message.payload?.parts) {
    content = await processMessageParts(
      message.payload.parts,
      turndownService,
      gmailClient,
      message.id!
    );
  }

  // trim all leading and trailing whitespace
  return content.trim();
}

function mimeTypeHtml(mimeType: string): boolean {
  return mimeType === "text/html" || mimeType === "text/x-amp-html";
}

async function processMessageParts(
  parts: gmail_v1.Schema$MessagePart[],
  turndownService: TurndownService,
  gmailClient: gmail_v1.Gmail,
  messageId: string
): Promise<string> {
  let content = "";

  // First look for text/html parts and fallback to text/plain parts
  const htmlParts = parts.filter((part) => mimeTypeHtml(part.mimeType ?? ""));
  if (htmlParts.length > 0) {
    content += htmlParts
      .map((part) => {
        if (!part.body?.data) return "";
        try {
          const decodedContent = Buffer.from(part.body.data, "base64").toString(
            "utf-8"
          );
          return turndownService
            .remove(["script", "style", "title"])
            .turndown(decodedContent);
        } catch (error) {
          console.warn("Failed to decode base64 data from HTML part:", error);
          return "";
        }
      })
      .filter(Boolean)
      .join("\n\n");
  } else {
    // If no HTML parts, look for text/plain parts
    const plainTextParts = parts.filter(
      (part) => part.mimeType === "text/plain"
    );
    if (plainTextParts.length > 0) {
      content += plainTextParts
        .map((part) => {
          if (!part.body?.data) return "";
          try {
            return Buffer.from(part.body.data, "base64").toString("utf-8");
          } catch (error) {
            console.warn(
              "Failed to decode base64 data from plain text part:",
              error
            );
            return "";
          }
        })
        .filter(Boolean)
        .join("\n\n");
    }
  }

  // Process remaining parts recursively if they are multipart/alternative
  for (const part of parts) {
    // skip already examined text/html and text/plain parts
    if (mimeTypeHtml(part.mimeType ?? "") || part.mimeType === "text/plain") {
      continue;
    }

    if (
      (part.mimeType === "multipart/alternative" ||
        part.mimeType === "multipart/mixed" ||
        part.mimeType === "multipart/related") &&
      part.parts
    ) {
      const recursiveContent = await processMessageParts(
        part.parts,
        turndownService,
        gmailClient,
        messageId
      );
      if (recursiveContent) {
        content += (content ? "\n\n" : "") + recursiveContent;
      }
    } else if (part.mimeType === "text/vnd.google.email-reaction+json") {
      content +=
        (content ? "\n\n" : "") +
        `<gmailReaction>${
          JSON.parse(
            Buffer.from(part.body?.data ?? "{}", "base64").toString("utf-8")
          ).emoji ?? ""
        }</gmailReaction>`;
    } else if (part.body?.attachmentId) {
      // ignore known-not useful attachments
      if (
        [
          "application/ics", // not very useful content here e.g. https://gist.githubusercontent.com/rgarcia/adb3ca82325f6b82e83b03f32e582d6e/raw/036e2d239e277f16cae55dbf928787f790c6855a/text%2520calendar%2520mimetype%2520example
          "text/calendar", // the same as application/ics
        ].includes(part.mimeType ?? "")
      ) {
        continue;
      }
      // todo: whitelist attachments that are useful as text
      // for now just don't get them
      // console.log(`Found attachment: ${part.filename} (${part.mimeType})`);
      // console.log(`Found attachment: ${part.filename} (${part.mimeType})`);
      // console.log(`Attachment ID: ${part.body.attachmentId}`);
      // console.log(`Size: ${part.body.size} bytes`);
      // const attachmentData = await getAttachmentData({
      //   gmailClient,
      //   messageId,
      //   attachmentId: part.body.attachmentId,
      // });
      const attachmentData = "";
      content +=
        (content ? "\n\n" : "") +
        `<attachment mimeType="${part.mimeType}" filename="${part.filename}" sizeBytes="${part.body.size}">${attachmentData}</attachment>`;
    } else {
      console.log(
        `Skipping unrecognized content with mime type: ${part.mimeType} (${part.parts?.length}))`
      );
      if (part.body?.data) {
        try {
          const skippedContent = Buffer.from(part.body.data, "base64").toString(
            "utf-8"
          );
          console.log("Skipped content:", skippedContent);
        } catch (error) {
          console.warn("Failed to decode skipped content:", error);
        }
      } else {
        console.log(JSON.stringify(part, null, 2));
      }
    }
  }

  return content;
}

type GetAttachmentData = {
  gmailClient: gmail_v1.Gmail;
  messageId: string;
  attachmentId: string;
};

async function getAttachmentData({
  gmailClient,
  messageId,
  attachmentId,
}: GetAttachmentData): Promise<string> {
  try {
    try {
      const response = await gmailClient.users.messages.attachments.get({
        userId: "me",
        messageId: messageId,
        id: attachmentId,
      });
      return response.data.data
        ? Buffer.from(response.data.data, "base64").toString("utf-8")
        : "";
    } catch (error) {
      console.error("Failed to fetch attachment data:", error);
      return "";
    }
  } catch (error) {
    console.error("Failed to get attachment data:", error);
    return "";
  }
}
