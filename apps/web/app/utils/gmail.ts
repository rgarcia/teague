import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import TurndownService from "turndown";

export function gmailClientForToken(token: string): gmail_v1.Gmail {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: token });
  return gmail({ version: "v1", auth });
}

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

export type ParsedGmailEmail = {
  llmFormatted: string;
  bodyWithoutThread: string;
  headers: {
    subject: string;
    date: string;
    to: string;
    from: string;
    cc: string;
    bcc: string;
    reply_to: string;
  };
  messageId: string;
  threadId: string;
  sent: boolean;
  labels: string[];
};

// Cache for Gmail label IDs to names
const labelCache = new Map<string, string>();

// Function to get label name from ID, using cache
async function getLabelName(
  labelId: string,
  gmailClient: gmail_v1.Gmail
): Promise<string> {
  // Return system labels as-is
  if (!labelId.startsWith("Label_")) {
    return labelId;
  }

  // Check cache first
  const cachedName = labelCache.get(labelId);
  if (cachedName) {
    return cachedName;
  }

  try {
    // Lookup label in Gmail API
    const label = await gmailClient.users.labels.get({
      userId: "me",
      id: labelId,
    });

    const labelName = label.data.name || labelId;
    // Cache the result
    labelCache.set(labelId, labelName);
    return labelName;
  } catch (error) {
    console.warn(`Failed to lookup label name for ${labelId}:`, error);
    return labelId;
  }
}

// Helper function to format email headers and content for embedding
async function formatEmailForEmbedding(
  headers: gmail_v1.Schema$MessagePartHeader[],
  content: string,
  syntheticHeaders: Record<string, string | string[]>
): Promise<string> {
  const headerMap = new Map(
    headers.map((h) => [h.name?.toLowerCase() || "", h.value || ""])
  );

  const relevantHeaders = [
    "date",
    "subject",
    "from",
    "to",
    "reply-to",
    "cc",
    "bcc",
    "message-id",
    "list-unsubscribe",
    "list-unsubscribe-post",
  ];

  const formattedHeaders = relevantHeaders
    .map((header) => {
      const value = headerMap.get(header);
      return value
        ? `${header.charAt(0).toUpperCase() + header.slice(1)}: ${value}`
        : null;
    })
    .filter(Boolean);

  // Add synthetic headers
  for (const [key, value] of Object.entries(syntheticHeaders)) {
    formattedHeaders.push(
      `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : value}`
    );
  }

  return `${formattedHeaders.join("\n")}\n\n${content}`;
}

// Helper function to check if a line is an email attribution
function isEmailAttribution(line: string): boolean {
  const trimmedLine = line.trim();
  // Match patterns like "On [date/time], [name] <email> wrote:"
  return (
    trimmedLine.startsWith("On ") &&
    (trimmedLine.includes(" wrote:") || trimmedLine.includes(" wrote "))
  );
}

// Helper function to check if a line indicates forwarded content
function isForwardedMessageMarker(line: string): boolean {
  const trimmedLine = line.trim().toLowerCase();
  return (
    trimmedLine.includes("forwarded message") ||
    trimmedLine.startsWith("---------- forwarded message ----------") ||
    trimmedLine.startsWith("begin forwarded message")
  );
}

// Function to clean and format email data
export async function parseGmailEmail(
  email: gmail_v1.Schema$Message,
  gmailClient: gmail_v1.Gmail,
  userEmail: string
): Promise<ParsedGmailEmail> {
  const body = await emailBodyToMarkdown(gmailClient, email);

  let lines = body.split("\n");
  const filteredLines: string[] = [];
  let skipRemainingLines = false;

  // pull out lines with "<attachment" and add them back at the end
  const attachments = lines.filter((line) => line.includes("<attachment"));
  lines = lines.filter((line) => !line.includes("<attachment"));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // If we've already determined we should skip all remaining lines, continue skipping
    if (skipRemainingLines) {
      continue;
    }

    // Check if the current line is a forwarded message marker, email attribution, or a quoted line
    const isRemovableLine =
      isForwardedMessageMarker(line) ||
      isEmailAttribution(line) ||
      trimmedLine.startsWith(">");

    // If this line is removable, check if *all* remaining lines are also removable
    // This controls for cases where an email contains responses inline. If this is the case we actually don't want to remove this line
    if (isRemovableLine) {
      let allRemainingRemovable = true;
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        const nextTrimmedLine = nextLine.trim();
        if (
          nextTrimmedLine.length > 0 &&
          !isForwardedMessageMarker(nextLine) &&
          !isEmailAttribution(nextLine) &&
          !nextTrimmedLine.startsWith(">")
        ) {
          allRemainingRemovable = false;
          break;
        }
      }

      // If all remaining lines are removable, enable skip mode
      if (allRemainingRemovable) {
        skipRemainingLines = true;
        continue;
      }
    }

    filteredLines.push(line);
  }

  filteredLines.push(...attachments);
  const bodyWithoutThread = filteredLines.join("\n").trim();
  const headers = email.payload?.headers || [];
  const headerMap = new Map(
    headers.map((h) => [h.name?.toLowerCase() || "", h.value || ""])
  );

  const subject = headerMap.get("subject") || "(no subject)";
  const to = headerMap.get("to") || "";
  const from = headerMap.get("from") || "";
  const sent = from.includes(userEmail);
  // Resolve label names
  const labels = await Promise.all(
    email.labelIds?.map((label) => getLabelName(label, gmailClient)) || []
  );

  const formattedEmail = await formatEmailForEmbedding(
    headers,
    bodyWithoutThread,
    {
      "Gmail-Message-ID": email.id!,
      "Gmail-Thread-ID": email.threadId!,
      Labels: labels,
    }
  );

  return {
    llmFormatted: formattedEmail,
    bodyWithoutThread: bodyWithoutThread,
    headers: {
      subject,
      date: headerMap.get("date") || "unknown date",
      to,
      from,
      cc: headerMap.get("cc") || "",
      bcc: headerMap.get("bcc") || "",
      reply_to: headerMap.get("reply-to") || "",
    },
    messageId: email.id!,
    threadId: email.threadId!,
    sent,
    labels,
  };
}
