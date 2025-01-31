import { authenticate } from "@google-cloud/local-auth";
import fs from "fs/promises";
import { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import path from "path";

// If modifying these scopes, delete token.json.
const SCOPES: string[] = [
  "https://mail.google.com/", // Read, compose, send, and permanently delete all your email from Gmail
  "https://www.googleapis.com/auth/gmail.addons.current.action.compose", // Manage drafts and send emails when you interact with the add-on
  "https://www.googleapis.com/auth/gmail.addons.current.message.action", // View your email messages when you interact with the add-on
  "https://www.googleapis.com/auth/gmail.addons.current.message.readonly", // View your email messages when the add-on is running
  "https://www.googleapis.com/auth/gmail.compose", // Manage drafts and send emails
  "https://www.googleapis.com/auth/gmail.insert", // Add emails into your Gmail mailbox
  "https://www.googleapis.com/auth/gmail.labels", // See and edit your email labels
  "https://www.googleapis.com/auth/gmail.modify", // Read, compose, and send emails from your Gmail account
  "https://www.googleapis.com/auth/gmail.readonly", // View your email messages and settings
  "https://www.googleapis.com/auth/gmail.send", // Send email on your behalf
  "https://www.googleapis.com/auth/gmail.settings.basic", // See, edit, create, or change your email settings and filters in Gmail
  "https://www.googleapis.com/auth/gmail.settings.sharing", // Manage your sensitive mail settings, including who can manage your mail
];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

async function getInboxMessages(
  gmail: gmail_v1.Gmail,
  maxResults: number = 5
): Promise<void> {
  try {
    // Search for messages in inbox
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: maxResults,
    });

    const messages = response.data.messages || [];

    if (!messages.length) {
      console.log("No unread messages found.");
      return;
    }

    console.log(`\nFound ${messages.length} unread messages:`);
    console.log("-".repeat(50));

    for (const message of messages) {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((header) => header.name?.toLowerCase() === "subject")
          ?.value || "(no subject)";
      const sender =
        headers.find((header) => header.name?.toLowerCase() === "from")
          ?.value || "(unknown sender)";

      console.log(`\nFrom: ${sender}`);
      console.log(`Subject: ${subject}`);
      console.log("-".repeat(50));
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

async function loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials) as OAuth2Client;
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client: OAuth2Client): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function main(): Promise<void> {
  let client: OAuth2Client | null = await loadSavedCredentialsIfExist();

  if (!client) {
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
      await saveCredentials(client);
    }
  }

  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    await getInboxMessages(gmail);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
