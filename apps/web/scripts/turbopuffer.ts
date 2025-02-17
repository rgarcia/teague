import { createClerkClient } from "@clerk/backend";
import { Command } from "@commander-js/extra-typings";
import { gmail_v1 } from "@googleapis/gmail";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Namespace, Turbopuffer, Vector } from "@turbopuffer/turbopuffer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import Database from "libsql";
import prompts from "prompts";
import { encoding_for_model } from "tiktoken";
import { emailBodyToMarkdown, gmailClientForToken } from "~/utils/gmail";

// Ensure we have the required environment variables
for (const key of [
  "CLERK_SECRET_KEY",
  "TURBOPUFFER_API_KEY",
  "OPENAI_API_KEY",
]) {
  if (!process.env[key]) {
    console.error(`${key} environment variable is required`);
    process.exit(1);
  }
}

let program = new Command();

program
  .description("CLI tool for vectorizing and reviewing gmail emails")
  .command("embed")
  .description(
    "Interactive mode for vectorizing and reviewing emails. Example usage: pnpm run turbopuffer embed -u $CLERK_USER_ID -n 30 -s 5 -q ''"
  )
  .option("-u, --user-id <id>", "Clerk user ID")
  .option("-n, --num-emails <number>", "Number of emails to embed", "30")
  .option("-q, --query <query>", "Gmail search query", "from:me -to:me")
  .option("--nuke-ns", "Delete and recreate the namespace", false)
  .option(
    "-i, --ignore-cache",
    "Ignore the SQLite database cache and re-embed all emails",
    false
  )
  .option(
    "-s, --sample-rate <rate>",
    "Percentage of emails to prompt for review (0-100)",
    "100"
  )
  .action(async (options) => {
    // Get user ID from command line arguments
    const userId = options.userId;
    if (!userId) {
      console.error("Please provide a user ID with --user-id");
      process.exit(1);
    }

    const numEmails = parseInt(options.numEmails, 10);
    const searchQuery = options.query;
    const nukeNamespace = options.nukeNs;
    const ignoreCache = options.ignoreCache;
    const sampleRate = Math.max(
      1,
      Math.min(100, parseInt(options.sampleRate, 10))
    );

    await initDatabase();

    let gmailClient: gmail_v1.Gmail;
    try {
      // Create a JWT template session token
      const token = await clerkClient.users.getUserOauthAccessToken(
        userId,
        "google"
      );
      gmailClient = gmailClientForToken(token.data[0].token);

      // Get user's email address
      const profile = await gmailClient.users.getProfile({
        userId: "me",
      });
      const userEmail = profile.data.emailAddress;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }

      // Set up Turbopuffer namespace
      const ns = setupEmailNamespace(userId);
      if (nukeNamespace) {
        await ns.deleteAll();
        console.log("Deleted existing namespace");
      }
      console.log(`Fetching emails matching query: ${searchQuery}\n`);

      let processedCount = 0;
      let pageToken: string | undefined | null = undefined;

      while (processedCount < numEmails) {
        // List emails matching the search query
        const listRes: gmail_v1.Schema$ListMessagesResponse = (
          await gmailClient.users.messages.list({
            userId: "me",
            q: searchQuery,
            maxResults: Math.min(50, numEmails - processedCount),
            pageToken: pageToken || undefined,
          })
        ).data;

        if (!listRes.messages || listRes.messages.length === 0) {
          console.log("No more emails found");
          break;
        }

        // Prepare batch of emails for vector indexing
        const emailVectors = [];

        // Fetch and display full details for each email
        for (const message of listRes.messages) {
          if (processedCount >= numEmails) break;

          // Skip if already embedded
          if (!ignoreCache && (await isEmailEmbedded(userId, message.id!))) {
            console.log(`Skipping already embedded email ${message.id}`);
            continue;
          }
          const fullEmail = await gmailClient.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "full",
          });
          const cleanedEmail = await cleanGmailEmail(
            fullEmail.data,
            gmailClient,
            userEmail
          );

          // Empty emails or unsubscribe emails are skipped
          if (
            cleanedEmail.filteredContent.trim() === "" ||
            isUnsubscribeEmail(
              cleanedEmail.headers.subject,
              cleanedEmail.headers.to,
              cleanedEmail.filteredContent
            )
          ) {
            continue;
          }
          // Add to batch for vector indexing
          const emailVector: Vector = {
            id: cleanedEmail.messageId,
            vector: await embedEmail(cleanedEmail),
            attributes: {
              subject: cleanedEmail.headers.subject,
              date: cleanedEmail.headers.date,
              to: cleanedEmail.headers.to,
              content: cleanedEmail.filteredContent,
              sent: cleanedEmail.sent,
              message_id: cleanedEmail.messageId,
              thread_id: cleanedEmail.threadId,
              from: cleanedEmail.headers.from,
              cc: cleanedEmail.headers.cc,
              bcc: cleanedEmail.headers.bcc,
              reply_to: cleanedEmail.headers.reply_to,
              labels: cleanedEmail.labels,
            },
          };
          emailVectors.push(emailVector);

          // pause for an audit
          if (Math.random() * 100 < sampleRate) {
            console.log("=".repeat(80));
            console.log(cleanedEmail.formattedEmail);
            console.log("=".repeat(80));
            console.log("\n");
            await promptToContinue(
              "Press Enter to mark this email reviewed or q to quit"
            );
          }

          processedCount++;
        }

        // Upsert batch of emails to the vector index
        if (emailVectors.length > 0) {
          await ns.upsert({
            vectors: emailVectors,
            distance_metric: "cosine_distance",
            schema: {
              subject: {
                type: "string",
                full_text_search: true,
              },
              date: {
                type: "string",
              },
              to: {
                type: "string",
                full_text_search: true,
              },
              from: {
                type: "string",
                full_text_search: true,
              },
              cc: {
                type: "string",
                full_text_search: true,
              },
              bcc: {
                type: "string",
                full_text_search: true,
              },
              reply_to: {
                type: "string",
                full_text_search: true,
              },
              content: {
                type: "string",
                full_text_search: true,
              },
              sent: {
                type: "bool",
                filterable: true,
              },
              message_id: {
                type: "string",
                filterable: true,
              },
              thread_id: {
                type: "string",
                filterable: true,
              },
              labels: {
                type: "[]string",
                filterable: true,
              },
            },
          });
          // Mark emails as embedded
          for (const emailVector of emailVectors) {
            await markEmailAsEmbedded(userId, emailVector.id.toString());
            console.log(`Embedded email ${emailVector.id}`);
          }
        }

        pageToken = listRes.nextPageToken;
        if (!pageToken) break;
      }

      console.log(
        `\nSuccessfully processed ${processedCount} emails in Turbopuffer`
      );
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// e.g. pnpm run turbopuffer single-message -u $CLERK_USER_ID -m 'CABOPztnhbKnPZ8q=FQohrBGtWsp+mVcjYVRmM5h83b5fBQD_jA@mail.gmail.com'
program
  .command("single-message")
  .description("Display a single email message")
  .option("-u, --user-id <id>", "Clerk user ID")
  .option("-m, --message-id <id>", "RFC 822 message ID header")
  .action(async (options) => {
    // Get user ID from command line arguments
    const userId = options.userId;
    if (!userId) {
      console.error("Please provide a user ID with --user-id");
      process.exit(1);
    }

    const messageId = options.messageId;
    if (!messageId) {
      console.error("Please provide a message ID (-m)");
      process.exit(1);
    }

    try {
      // Create a JWT template session token
      const token = await clerkClient.users.getUserOauthAccessToken(
        userId,
        "google"
      );
      const gmailClient = gmailClientForToken(token.data[0].token);

      // Get user's email address
      const profile = await gmailClient.users.getProfile({
        userId: "me",
      });
      const userEmail = profile.data.emailAddress;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }

      const query = `rfc822msgid:${messageId}`;
      console.log(`Searching for emails matching query: ${query}`);
      const listRes = await gmailClient.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 1,
      });

      if (!listRes.data.messages || listRes.data.messages.length === 0) {
        console.error("No emails found matching the search query");
        process.exit(1);
      }

      const fullEmail = await gmailClient.users.messages.get({
        userId: "me",
        id: listRes.data.messages[0].id!,
        format: "full",
      });

      const cleanedEmail = await cleanGmailEmail(
        fullEmail.data,
        gmailClient,
        userEmail
      );

      console.log("=".repeat(80));
      console.log("Formatted Email:");
      console.log("=".repeat(80));
      console.log(cleanedEmail.formattedEmail);
      console.log("\n");
      console.log("=".repeat(80));
      console.log("Headers:");
      console.log("=".repeat(80));
      console.log(JSON.stringify(cleanedEmail.headers, null, 2));
      console.log("=".repeat(80));
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// e.g. pnpm run turbopuffer search -u $CLERK_USER_ID
// e.g. pnpm run turbopuffer search -u $CLERK_USER_ID -q "from:me -to:me"
// e.g. pnpm run turbopuffer search -u $CLERK_USER_ID -m 'CABOPztnhbKnPZ8q=FQohrBGtWsp+mVcjYVRmM5h83b5fBQD_jA@mail.gmail.com'
program
  .command("search")
  .description("Search for similar emails")
  .option("-u, --user-id <id>", "Clerk user ID")
  .option("-q, --query <query>", "Gmail search query")
  .option("-m, --message-id <id>", "RFC 822 message ID header")
  .action(async (options) => {
    // Get user ID from command line arguments
    const userId = options.userId;
    if (!userId) {
      console.error("Please provide a user ID with --user-id");
      process.exit(1);
    }

    // Validate that only one of -q or -m is provided
    if (options.query && options.messageId) {
      console.error("Please provide only one of --query or --message-id");
      process.exit(1);
    }

    let searchQuery: string;
    if (options.messageId) {
      searchQuery = `rfc822msgid:${options.messageId}`;
    } else if (options.query) {
      searchQuery = options.query;
    } else {
      // Default case: random day in last 30 days
      const randomDay = Math.floor(Math.random() * 29) + 1; // 1 to 30
      searchQuery = `older_than:${randomDay}d newer_than:${randomDay + 1}d`;
    }

    try {
      const token = await clerkClient.users.getUserOauthAccessToken(
        userId,
        "google"
      );
      const gmailClient = gmailClientForToken(token.data[0].token);
      const profile = await gmailClient.users.getProfile({
        userId: "me",
      });
      const userEmail = profile.data.emailAddress;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }
      const ns = await setupEmailNamespace(userId);

      console.log(`Searching for emails matching query: ${searchQuery}`);
      const listRes = await gmailClient.users.messages.list({
        userId: "me",
        q: searchQuery,
        maxResults: options.messageId ? 1 : 100, // Only need 1 if message ID provided
      });

      if (!listRes.data.messages || listRes.data.messages.length === 0) {
        console.error("No emails found matching the search query");
        process.exit(1);
      }

      // Pick a random email if not searching by message ID
      const targetEmail = options.messageId
        ? listRes.data.messages[0]
        : listRes.data.messages[
            Math.floor(Math.random() * listRes.data.messages.length)
          ];

      const fullEmail = await gmailClient.users.messages.get({
        userId: "me",
        id: targetEmail.id!,
        format: "full",
      });

      const cleanedEmail = await cleanGmailEmail(
        fullEmail.data,
        gmailClient,
        userEmail
      );

      // Get vector for the email
      const vector = await embedEmail(cleanedEmail);

      console.log("\nSearching for emails similar to:\n");
      console.log("=".repeat(80));
      console.log(cleanedEmail.formattedEmail);
      console.log("=".repeat(80));

      // Pause for user to review the target email
      await promptToContinue("Press Enter to see similar emails or q to quit");

      const results = await ns.query({
        vector,
        top_k: 5,
        distance_metric: "cosine_distance",
        include_attributes: ["subject", "content", "date"],
      });

      console.log("\nSimilar emails found:\n");
      for (const result of results) {
        console.log("=".repeat(80));
        console.log(`Subject: ${result.attributes?.subject}`);
        console.log(`Date: ${result.attributes?.date}`);
        console.log(
          `Similarity Score: ${(100 * (2 - (result.dist ?? 2))) / 2}%`
        );
        console.log("\nContent:");
        console.log(result.attributes?.content);
        console.log("=".repeat(80));
        console.log("\n");

        // Pause for user to review each similar email
        await promptToContinue(
          "Press Enter to see next similar email or q to quit"
        );
      }
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

// SQLite database setup
const db = new Database("scripts/turbopuffer.db");

// Initialize database table if it doesn't exist
async function initDatabase() {
  const stmt = db.prepare(`
    CREATE TABLE IF NOT EXISTS embedded_emails (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      embedded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, message_id)
    )
  `);
  stmt.run();
}

// Check if an email has been reviewed
async function isEmailEmbedded(
  userId: string,
  messageId: string
): Promise<boolean> {
  const stmt = db.prepare(
    "SELECT 1 FROM embedded_emails WHERE user_id = ? AND message_id = ?"
  );
  const result = stmt.all(userId, messageId);
  return result.length > 0;
}

// Mark an email as embedded
async function markEmailAsEmbedded(userId: string, messageId: string) {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO embedded_emails (user_id, message_id) VALUES (?, ?)"
  );
  stmt.run(userId, messageId);
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  openAIApiKey: process.env.OPENAI_API_KEY,
});
const tpuf = new Turbopuffer({
  apiKey: process.env.TURBOPUFFER_API_KEY!,
  baseUrl: "https://gcp-us-central1.turbopuffer.com",
});

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

// Helper function to average vectors
function averageVectors(vectors: number[][]): number[] {
  const numVectors = vectors.length;
  const vectorLength = vectors[0].length;
  const result = new Array(vectorLength).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < vectorLength; i++) {
      result[i] += vector[i];
    }
  }

  for (let i = 0; i < vectorLength; i++) {
    result[i] /= numVectors;
  }

  return result;
}

// Helper function to get email vector embedding
async function embedText(text: string): Promise<number[]> {
  // Initialize tiktoken encoder for the embedding model
  const encoder = encoding_for_model("text-embedding-3-small");

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // Maximum tokens per chunk
    chunkOverlap: 200, // 20% overlap to preserve context
    separators: ["\n\n", "\n", " ", ""], // Logical split points
    lengthFunction: (text: string) => {
      // Get accurate token count using tiktoken
      const tokens = encoder.encode(text);
      return tokens.length;
    },
  });

  try {
    // Split the text into chunks
    const chunks = await textSplitter.createDocuments([text]);

    // Generate embeddings for each chunk
    const vectorStore = await embeddings.embedDocuments(
      chunks.map((chunk: { pageContent: string }) => chunk.pageContent)
    );

    // Average the vectors into a single vector
    return averageVectors(vectorStore);
  } finally {
    // Don't forget to free the encoder when done
    encoder.free();
  }
}

// Type for cleaned up email data
type CleanedEmailData = {
  formattedEmail: string;
  filteredContent: string;
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

// Function to clean and format email data
async function cleanGmailEmail(
  email: gmail_v1.Schema$Message,
  gmailClient: gmail_v1.Gmail,
  userEmail: string
): Promise<CleanedEmailData> {
  const content = await emailBodyToMarkdown(gmailClient, email);

  let lines = content.split("\n");
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
  const filteredContent = filteredLines.join("\n").trim();
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
    filteredContent,
    {
      "Gmail-Message-ID": email.id!,
      "Gmail-Thread-ID": email.threadId!,
      Labels: labels,
    }
  );

  return {
    formattedEmail,
    filteredContent,
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

// Function to get email vector embedding from cleaned data
async function embedEmail(cleanedEmail: CleanedEmailData): Promise<number[]> {
  return await embedText(cleanedEmail.formattedEmail);
}

function setupEmailNamespace(userId: string): Namespace {
  const namespaceName = `email-index-${userId}`;
  return tpuf.namespace(namespaceName);
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

// Helper function to check if an email is an unsubscribe request
function isUnsubscribeEmail(
  subject: string,
  to: string,
  content: string
): boolean {
  const lowerSubject = subject.toLowerCase();
  const lowerContent = content.toLowerCase();
  const lowerTo = to.toLowerCase();

  return (
    // Check common patterns in subject
    lowerSubject.includes("unsubscribe") ||
    // Check common patterns in recipient
    lowerTo.includes("unsubscribe") ||
    // Check common patterns in content
    lowerContent.includes("this is an unsubscribe request") ||
    lowerContent.includes("unsubscribe request sent from")
  );
}

// Helper function to prompt user to continue or quit
async function promptToContinue(message: string): Promise<boolean> {
  const response = await prompts({
    type: "text",
    name: "action",
    message,
    validate: (value) => value === "" || value.toLowerCase() === "q",
  });

  if (response.action?.toLowerCase() === "q") {
    console.log("Exiting...");
    process.exit(0);
  }

  return true;
}

program.parse(process.argv);
