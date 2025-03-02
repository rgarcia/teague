import { createClerkClient } from "@clerk/backend";
import { Command } from "@commander-js/extra-typings";
import { gmail_v1 } from "@googleapis/gmail";
import { VoyageEmbeddings } from "@langchain/community/embeddings/voyage";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Namespace, Turbopuffer, Vector } from "@turbopuffer/turbopuffer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import Database from "libsql";
import pMap from "p-map";
import prompts from "prompts";
import { encoding_for_model } from "tiktoken";
import {
  gmailClientForToken,
  parseGmailEmail,
  type ParsedGmailEmail,
} from "~/utils/gmail";

// Ensure we have the required environment variables
for (const key of [
  "CLERK_SECRET_KEY",
  "TURBOPUFFER_API_KEY",
  "OPENAI_API_KEY",
  "VOYAGE_API_KEY",
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
  .option(
    "-m, --model <model>",
    "Embedding model to use (openai/* for OpenAI models or voyage/* for Voyage models)",
    "voyage/voyage-3-large"
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
      0,
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
        console.log(`Processing ${processedCount} of ${numEmails} emails`);
        // List emails matching the search query
        const listRes: gmail_v1.Schema$ListMessagesResponse = (
          await gmailClient.users.messages.list({
            userId: "me",
            q: searchQuery,
            maxResults: Math.min(10, numEmails - processedCount),
            pageToken: pageToken || undefined,
          })
        ).data;

        if (!listRes.messages || listRes.messages.length === 0) {
          console.log("No more emails found");
          break;
        }

        // Prepare batch of emails for vector indexing
        const emailVectors = await pMap(
          listRes.messages,
          async (message) => {
            if (processedCount >= numEmails) return null;

            // Skip if already embedded
            if (!ignoreCache && (await isEmailEmbedded(userId, message.id!))) {
              console.log(`Skipping already embedded email ${message.id}`);
              processedCount++;
              return null;
            } else {
              console.log(`Embedding email ${message.id}`);
            }

            const fullEmail = await gmailClient.users.messages.get({
              userId: "me",
              id: message.id!,
              format: "full",
            });
            const cleanedEmail = await parseGmailEmail(
              fullEmail.data,
              gmailClient,
              userEmail
            );

            // Empty emails or unsubscribe emails are skipped
            if (
              cleanedEmail.bodyWithoutThread.trim() === "" ||
              isUnsubscribeEmail(
                cleanedEmail.headers.subject,
                cleanedEmail.headers.to,
                cleanedEmail.bodyWithoutThread
              )
            ) {
              return null;
            }

            // Add to batch for vector indexing
            const emailVector: Vector = {
              id: cleanedEmail.messageId,
              vector: await embedEmail(cleanedEmail, options.model),
              attributes: {
                subject: cleanedEmail.headers.subject,
                date: cleanedEmail.headers.date,
                to: cleanedEmail.headers.to,
                content: cleanedEmail.bodyWithoutThread,
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

            // pause for an audit
            if (Math.random() * 100 < sampleRate) {
              console.log("=".repeat(80));
              console.log(cleanedEmail.llmFormatted);
              console.log("=".repeat(80));
              console.log("\n");
              await promptToContinue(
                "Press Enter to mark this email reviewed or q to quit"
              );
            }

            processedCount++;
            return emailVector;
          },
          {
            concurrency: 5, // Process 5 emails in parallel
            stopOnError: false,
          }
        );

        // Filter out null values and prepare for upsert
        const validEmailVectors = emailVectors.filter(
          (v): v is Vector => v !== null
        );

        // Upsert batch of emails to the vector index
        if (validEmailVectors.length > 0) {
          await ns.upsert({
            vectors: validEmailVectors,
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
          for (const emailVector of validEmailVectors) {
            await markEmailAsEmbedded(userId, emailVector.id.toString());
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

      const cleanedEmail = await parseGmailEmail(
        fullEmail.data,
        gmailClient,
        userEmail
      );

      console.log("=".repeat(80));
      console.log("Formatted Email:");
      console.log("=".repeat(80));
      console.log(cleanedEmail.llmFormatted);
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
  .option("--message-id <id>", "RFC 822 message ID header")
  .option(
    "-m, --model <model>",
    "Embedding model to use (openai/* for OpenAI models or voyage/* for Voyage models)",
    "voyage/voyage-3-large"
  )
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

      const cleanedEmail = await parseGmailEmail(
        fullEmail.data,
        gmailClient,
        userEmail
      );

      // Get vector for the email
      const vector = await embedEmail(cleanedEmail, options.model);

      console.log("\nSearching for emails similar to:\n");
      console.log("=".repeat(80));
      console.log(cleanedEmail.llmFormatted);
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

// Namespace management commands
const nsprogram = program
  .command("ns")
  .description("Namespace management commands");
nsprogram
  .command("list")
  .description("List all Turbopuffer namespaces")
  .option(
    "-p, --prefix <prefix>",
    "Filter namespaces by prefix (e.g. 'email-')",
    ""
  )
  .action(async (options) => {
    try {
      const { prefix } = options;
      console.log(
        `Listing all Turbopuffer namespaces${
          prefix ? ` with prefix '${prefix}'` : ""
        }...`
      );

      const params: { prefix?: string } = {};
      if (prefix) {
        params.prefix = prefix;
      }

      const result = await tpuf.namespaces(params);
      // Ensure we have a valid result
      const namespaces = result.namespaces || [];

      if (namespaces.length === 0) {
        console.log("No namespaces found.");
        return;
      }

      console.log(`Found ${namespaces.length} namespaces:`);
      console.log("=".repeat(80));

      for (const namespace of namespaces) {
        console.log(`Namespace: ${namespace.id}`);
        console.log("-".repeat(80));
      }
    } catch (error) {
      console.error("Error listing namespaces:", error);
      process.exit(1);
    }
  });

nsprogram
  .command("delete")
  .description("Delete a Turbopuffer namespace")
  .argument("<namespace>", "Name of the namespace to delete")
  .action(async (namespace) => {
    try {
      const ns = tpuf.namespace(namespace);
      await ns.deleteAll();
      console.log(`Successfully deleted namespace: ${namespace}`);
    } catch (error) {
      console.error("Error deleting namespace:", error);
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

// Initialize embeddings cache
let embeddingsCache: Map<string, OpenAIEmbeddings | VoyageEmbeddings> =
  new Map();

function embeddings(model: string): OpenAIEmbeddings | VoyageEmbeddings {
  // Check cache first
  if (embeddingsCache.has(model)) {
    return embeddingsCache.get(model)!;
  }

  const [provider, modelName] = model.split("/");
  if (!provider || !modelName) {
    throw new Error(
      `Invalid model format. Expected provider/model-name, got: ${model}`
    );
  }

  let embedder: OpenAIEmbeddings | VoyageEmbeddings;
  switch (provider.toLowerCase()) {
    case "openai":
      embedder = new OpenAIEmbeddings({
        modelName,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
      break;
    case "voyage":
      embedder = new VoyageEmbeddings({
        apiKey: process.env.VOYAGE_API_KEY,
        modelName,
      });
      break;
    default:
      throw new Error(
        `Unsupported model provider: ${provider}. Must be either 'openai' or 'voyage'`
      );
  }

  // Cache the embedder instance
  embeddingsCache.set(model, embedder);
  return embedder;
}

// Update the embeddings initialization to use the model parameter
const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const tpuf = new Turbopuffer({
  apiKey: process.env.TURBOPUFFER_API_KEY!,
  baseUrl: "https://gcp-us-central1.turbopuffer.com",
});

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

const maxInputForModel = {
  "openai/text-embedding-3-small": 8192,
  "openai/text-embedding-3-large": 8192,
  "openai/text-embedding-ada-002": 8192,
  "voyage/voyage-3-large": 32000,
  "voyage/voyage-3-lite": 32000,
  "voyage/voyage-3": 32000,
};

// Update embedText to initialize embeddings with the model parameter
async function embedText(text: string, model: string): Promise<number[]> {
  // Initialize embeddings if not already done
  const embedder = embeddings(model);

  // Initialize tiktoken encoder for the embedding model
  const encoder = encoding_for_model("text-embedding-3-small");

  const textSplitter = new RecursiveCharacterTextSplitter({
    // Set chunk size to roughly 1/4 of the model's max input size to allow for overlap
    // and ensure we stay well within limits even with metadata
    chunkSize: Math.floor(
      maxInputForModel[model as keyof typeof maxInputForModel] / 4
    ),
    // Set overlap to 15% of chunk size
    chunkOverlap: Math.floor(
      (maxInputForModel[model as keyof typeof maxInputForModel] / 4) * 0.15
    ),
    separators: ["\n\n", "\n", " ", ""],
    lengthFunction: (text: string) => {
      const tokens = encoder.encode(text);
      return tokens.length;
    },
  });

  try {
    const chunks = await textSplitter.createDocuments([text]);
    const vectorStore = await embedder.embedDocuments(
      chunks.map((chunk: { pageContent: string }) => chunk.pageContent)
    );
    return averageVectors(vectorStore);
  } finally {
    encoder.free();
  }
}

// Update embedEmail to pass through the model parameter
async function embedEmail(
  cleanedEmail: ParsedGmailEmail,
  model: string
): Promise<number[]> {
  return await embedText(cleanedEmail.llmFormatted, model);
}

function setupEmailNamespace(userId: string): Namespace {
  const namespaceName = `email-index-${userId}`;
  return tpuf.namespace(namespaceName);
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
