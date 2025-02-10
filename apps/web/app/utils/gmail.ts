import { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import TurndownService from "turndown";

export const gmailClientForToken = (token: string) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return google.gmail({ version: "v1", auth });
};

// Helper function to sanitize email content
export function sanitizeForSummary(message: gmail_v1.Schema$Message): string {
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
    const textParts = message.payload.parts.filter((part) =>
      part.mimeType?.startsWith("text/")
    );

    // Prefer plain text if available
    const plainTextParts = textParts.filter(
      (part) => part.mimeType === "text/plain"
    );
    const partsToUse = plainTextParts.length > 0 ? plainTextParts : textParts;

    // Get content from relevant parts
    content = partsToUse
      .map((part) => {
        const data = part.body?.data;
        if (data) {
          try {
            const decodedContent = Buffer.from(data, "base64").toString(
              "utf-8"
            );
            return part.mimeType === "text/html"
              ? turndownService
                  .remove(["script", "style", "title"])
                  .turndown(decodedContent)
              : decodedContent;
          } catch (error) {
            console.warn("Failed to decode base64 data from part:", error);
            return "";
          }
        }
        return "";
      })
      .filter((content) => content.length > 0)
      .join("\n\n");
  }

  return content;
}
