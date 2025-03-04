import { Command } from "@commander-js/extra-typings";
import { calendar_v3 } from "@googleapis/calendar";
import { gmail_v1 } from "@googleapis/gmail";
import fs from "fs/promises";
import nodemailer from "nodemailer";
import Mail from "nodemailer/lib/mailer";
import path from "path";
import prompts from "prompts";
import { clerk } from "~/utils/clerk";
import { calendarClientForToken } from "~/utils/gcal";
import { gmailClientForToken } from "~/utils/gmail";
import { tokeninfo } from "~/utils/tokeninfo";

interface DemoUser {
  userId: string;
  gmailToken: string;
  gmailClient: gmail_v1.Gmail;
  email: string;
  googleAppPassword: string;
}

const DEMO_DATA_DIR = "./scripts/demo-data";

function mustEnvs<T extends Record<string, string>>(
  keys: T
): { [K in keyof T]: string } {
  const errors: string[] = [];
  const result = {} as { [K in keyof T]: string };

  for (const key in keys) {
    const envValue = process.env[key];
    if (!envValue) {
      errors.push(`${key} environment variable is required`);
    } else {
      result[key] = envValue;
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return result;
}

let env = mustEnvs({
  CLERK_SECRET_KEY: "",
  TURBOPUFFER_API_KEY: "",
  OPENAI_API_KEY: "",
  VOYAGE_API_KEY: "",
  GOOGLE_APP_PASSWORD_me: "",
  GOOGLE_APP_PASSWORD_hi: "",
  GOOGLE_APP_PASSWORD_tyler: "",
  GOOGLE_APP_PASSWORD_julie: "",
  LIST_UNSUBSCRIBE_FAKE_URL: "",
});

const userIds = {
  me: "user_2scnwMR0mDzPlauRlNAj3bAz63j",
  hi: "user_2tonITqhEwoRFVzUCpKiS5uwjVI",
  tyler: "user_2tonWOq0aKjItGrgyDqZ5GXux3W",
  julie: "user_2toncQ8HexE8ZDhpf4K3CV4eZt2",
} as const;
const userNames = ["me", "hi", "julie", "tyler"] as const;

const appPasswords = {
  me: env.GOOGLE_APP_PASSWORD_me,
  hi: env.GOOGLE_APP_PASSWORD_hi,
  tyler: env.GOOGLE_APP_PASSWORD_tyler,
  julie: env.GOOGLE_APP_PASSWORD_julie,
} as const;

function validateUser(value: string, paramName: string): keyof DemoUserMap {
  if (!userNames.includes(value as keyof typeof userIds)) {
    throw new Error(`${paramName} must be one of: ${userNames.join(", ")}`);
  }
  return value as keyof DemoUserMap;
}

type DemoUserMap = {
  [K in keyof typeof userIds]: DemoUser;
};

async function initDemoUsers(): Promise<DemoUserMap> {
  const users: Record<keyof typeof userIds, DemoUser> = {} as Record<
    keyof typeof userIds,
    DemoUser
  >;

  await Promise.all(
    (Object.entries(userIds) as [keyof typeof userIds, string][]).map(
      async ([name, userId]) => {
        try {
          const token = await clerk.users.getUserOauthAccessToken(
            userId,
            "google"
          );
          const gmailToken = token.data[0].token;
          const gmailClient = gmailClientForToken(gmailToken);
          const tokenInfo = await tokeninfo(gmailToken);

          if (!tokenInfo.email) {
            throw new Error(`No email found for user ${name}`);
          }

          users[name] = {
            userId,
            gmailToken,
            gmailClient,
            email: tokenInfo.email,
            googleAppPassword: appPasswords[name],
          };
        } catch (error) {
          console.error(`Error setting up user ${name}:`, error);
          throw error; // Re-throw to ensure initialization fails if any user fails
        }
      }
    )
  );

  return users as DemoUserMap;
}

let program = new Command();

program
  .description("CLI tool for setting up the demo")
  .command("setup")
  .description(
    "Set up a demo environment with prepared emails in the hi user's inbox"
  )
  .action(async () => {
    console.log("Setting up demo environment...");
    const users = await initDemoUsers();
    const hiUser = users.hi;

    // Step 1: Archive all existing emails in hi's inbox
    await archiveAllEmails(hiUser);

    // Step 2: Add newsletters using tyler's SMTP credentials
    console.log("\nAdding newsletters...");
    await sendRawEmail({
      fromUser: users.tyler,
      toUser: hiUser,
      emailFileName: "newsletter-constructionphysics",
    });
    await sendRawEmail({
      fromUser: users.tyler,
      toUser: hiUser,
      emailFileName: "newsletter-mattlevine",
    });

    // Wait to ensure emails are processed
    console.log("Waiting for newsletters to be processed...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Add calendar invites
    console.log("\nAdding calendar invites...");
    await sendCalendarInvite(
      users.tyler,
      hiUser,
      "Meeting to discuss project",
      "Let's sync up on our current progress and next steps."
    );
    await sendCalendarInvite(users.julie, hiUser, "Kids doctor's appointment");

    // Wait to ensure invites are processed
    console.log("Waiting for calendar invites to be processed...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Add a personal email that deserves a reply
    console.log("\nAdding personal email...");
    await sendRawEmail({
      fromUser: users.julie,
      toUser: hiUser,
      subject: "Grocery list reminder",
      content: "Remember to get stuff to make pancakes this weekend!",
    });

    // Wait to ensure personal email is processed
    console.log("Waiting for personal email to be processed...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 5: Add promotion emails
    console.log("\nAdding promotion emails...");
    await sendRawEmail({
      fromUser: users.tyler,
      toUser: hiUser,
      emailFileName: "promotions-linkedin",
    });
    await sendRawEmail({
      fromUser: users.tyler,
      toUser: hiUser,
      emailFileName: "promotions-anthropic",
    });
    await sendRawEmail({
      fromUser: users.tyler,
      toUser: hiUser,
      emailFileName: "promotions-rottentomatoes",
    });

    console.log("\nDemo environment setup complete!");
    console.log(`Inbox ready for ${hiUser.email}`);
  });

interface SendRawEmailOptions {
  fromUser: DemoUser;
  toUser: DemoUser;
  emailFileName?: string;
  content?: string;
  subject?: string;
  spoofFrom?: string;
}

async function sendRawEmail(options: SendRawEmailOptions) {
  const { fromUser, toUser } = options;
  let mailOptions: Mail.Options;

  if (options.emailFileName) {
    // Load email data from file
    const filePath = path.join(DEMO_DATA_DIR, `${options.emailFileName}.json`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    mailOptions = JSON.parse(fileContent);
    // Override the to field
    mailOptions.to = toUser.email;
  } else {
    // Create a simple email with the provided text content
    mailOptions = {
      from: fromUser.email,
      to: toUser.email,
      subject: options.subject || "No Subject",
      text: options.content || "",
    };
  }

  // Apply spoofed from if provided
  if (options.spoofFrom) {
    mailOptions.from = options.spoofFrom;
    mailOptions.replyTo = fromUser.email; // make sure if a reply is made it doesn't go to the spoofed from address
  }

  // Create SMTP transporter with the from user's credentials
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: fromUser.email,
      pass: fromUser.googleAppPassword,
    },
  });

  // Send it
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Message sent: ${info.messageId}`);
    console.log(`From: ${mailOptions.from}`);
    if (options.spoofFrom) {
      console.log(`Spoofed From: ${options.spoofFrom}`);
    }
    console.log(`Actual From (in Gmail): ${fromUser.email}`);
    console.log(`To: ${toUser.email}`);
    if (mailOptions.subject) {
      console.log(`Subject: ${mailOptions.subject}`);
    }
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

program
  .command("send-raw")
  .description("Send an email using SMTP")
  .requiredOption(
    "-f, --from <user>",
    `User SMTP account to send the email from (${userNames.join(", ")})`,
    (value: string) => validateUser(value, "from")
  )
  .option(
    "--spoof-from <from>",
    "Spoof the from address to the specified address, e.g. 'Marc Andreeson <marc@andreeson.com>'"
  )
  .requiredOption(
    "-t, --to <user>",
    `User to send the email to (${userNames.join(", ")})`,
    (value: string) => validateUser(value, "to")
  )
  .option(
    "-n, --name <filename>",
    "Name of the JSON file to load from scripts/demo-data (without extension)"
  )
  .option(
    "-c, --content <text>",
    "Direct text content to send in the email (alternative to --name)"
  )
  .option(
    "-s, --subject <subject>",
    "Subject of the email (only used with --content)",
    "Test email"
  )
  .action(async (options) => {
    // Validate: either name or content must be provided, but not both
    if (!options.name && !options.content) {
      throw new Error("Either --name or --content must be provided");
    }
    if (options.name && options.content) {
      throw new Error(
        "Only one of --name or --content can be provided, not both"
      );
    }

    const users = await initDemoUsers();
    const fromUser = users[options.from];
    const toUser = users[options.to];
    await sendRawEmail({
      fromUser,
      toUser,
      emailFileName: options.name,
      content: options.content,
      subject: options.subject,
      spoofFrom: options.spoofFrom,
    });
  });

program
  .command("save-raw")
  .description("Save email data from a Gmail search to a JSON file")
  .requiredOption(
    "-i, --inbox <user>",
    `User inbox to search (${userNames.join(", ")})`,
    (value: string) => validateUser(value, "inbox")
  )
  .requiredOption("-s, --search <query>", "Gmail search query")
  .requiredOption(
    "-n, --name <filename>",
    "Name of the JSON file to save (without extension)"
  )
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    const users = await initDemoUsers();
    const user = users[options.inbox];
    await fs.mkdir(DEMO_DATA_DIR, { recursive: true });
    const response = await user.gmailClient.users.messages.list({
      userId: "me",
      q: options.search,
      maxResults: 1,
    });
    if (!response.data.messages?.length) {
      throw new Error(`No messages found matching search: ${options.search}`);
    }

    const messageId = response.data.messages[0].id!;
    const message = await user.gmailClient.users.messages.get({
      userId: "me",
      id: messageId,
    });
    const headers = message.data.payload?.headers;
    if (!headers) {
      throw new Error("No headers found in message");
    }

    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value || undefined;

    // Extract content based on message structure
    const contentType = getHeader("content-type")?.toLowerCase() || "";
    let htmlContent: string | undefined;
    let textContent: string | undefined;

    if (message.data.payload?.parts) {
      // Case 1: Multipart message
      for (const part of message.data.payload.parts) {
        const partContentType = part.mimeType?.toLowerCase();
        const data = part.body?.data;

        if (data) {
          if (
            (htmlContent === undefined && partContentType === "text/html") ||
            partContentType === "text/x-amp-html"
          ) {
            htmlContent = Buffer.from(data, "base64").toString();
          } else if (
            textContent === undefined &&
            partContentType === "text/plain"
          ) {
            textContent = Buffer.from(data, "base64").toString();
          }
        }
      }
    } else if (message.data.payload?.body?.data) {
      // Case 2: Direct content
      const content = Buffer.from(
        message.data.payload.body.data,
        "base64"
      ).toString();
      if (contentType.includes("text/html")) {
        htmlContent = content;
      } else if (contentType.includes("text/plain")) {
        textContent = content;
      }
    }

    const mailOptions: Mail.Options = {
      from: getHeader("from") || undefined,
      to: getHeader("to") || undefined,
      cc: getHeader("cc"),
      subject: getHeader("subject") || "No Subject",
      html: htmlContent,
      text: textContent,
    };

    // Only add List-Unsubscribe headers if both original headers are present
    if (getHeader("list-unsubscribe") && getHeader("list-unsubscribe-post")) {
      mailOptions.headers = {
        "List-Unsubscribe": `<${env.LIST_UNSUBSCRIBE_FAKE_URL}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      } as Mail.Headers;
    }

    if (!options.yes) {
      console.log("\nFound email with the following details:");
      console.log(JSON.stringify(mailOptions, null, 2));

      const { confirmed } = await prompts({
        type: "confirm",
        name: "confirmed",
        message: "Save this email data?",
        initial: true,
      });

      if (!confirmed) {
        console.log("Exiting without saving");
        return;
      }
    }

    // Save to file
    const filePath = path.join(DEMO_DATA_DIR, `${options.name}.json`);
    await fs.writeFile(filePath, JSON.stringify(mailOptions, null, 2));
    console.log(`Saved email data to ${filePath}`);
  });

program
  .command("invite")
  .description("Create a calendar invite from one user to another")
  .requiredOption(
    "-f, --from <user>",
    `User to send the invite from (${userNames.join(", ")})`,
    (value: string) => validateUser(value, "from")
  )
  .requiredOption(
    "-t, --to <user>",
    `User to send the invite to (${userNames.join(", ")})`,
    (value: string) => validateUser(value, "to")
  )
  .option(
    "-s, --subject <subject>",
    "Subject of the calendar event",
    "Meeting to discuss project"
  )
  .option(
    "-d, --description <description>",
    "Description of the calendar event",
    "Let's sync up on our current progress and next steps."
  )
  .action(async (options) => {
    const users = await initDemoUsers();
    const fromUser = users[options.from];
    const toUser = users[options.to];

    // Use our helper function for sending calendar invites
    await sendCalendarInvite(
      fromUser,
      toUser,
      options.subject,
      options.description
    );
  });

// Extract invite functionality into a reusable function
async function sendCalendarInvite(
  fromUser: DemoUser,
  toUser: DemoUser,
  subject: string,
  description?: string
) {
  const calendarClient = calendarClientForToken(fromUser.gmailToken);

  // Create a date for the event - few days out at noon
  const today = new Date();
  const eventDate = new Date(today);
  eventDate.setDate(today.getDate() + 3); // 3 days from now
  eventDate.setHours(12, 0, 0, 0); // Set to noon

  // End time (1 hour later)
  const endDate = new Date(eventDate);
  endDate.setHours(endDate.getHours() + 1);

  // Format dates for Google Calendar API
  const startDateTime = eventDate.toISOString();
  const endDateTime = endDate.toISOString();

  // Create the event
  const event: calendar_v3.Schema$Event = {
    summary: subject,
    description: description || "",
    start: {
      dateTime: startDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    attendees: [{ email: fromUser.email }, { email: toUser.email }],
  };

  try {
    const response = await calendarClient.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all", // Send email notifications to attendees
    });

    console.log(`Calendar event created with ID: ${response.data.id}`);
    console.log(`Link to event: ${response.data.htmlLink}`);
    console.log(`From: ${fromUser.email}`);
    console.log(`To: ${toUser.email}`);
    console.log(`Subject: ${subject}`);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    throw error;
  }
}

// Create a function to archive all emails
async function archiveAllEmails(user: DemoUser): Promise<void> {
  console.log(`Archiving all emails for ${user.email}...`);

  // Get all emails in the inbox
  const response = await user.gmailClient.users.messages.list({
    userId: "me",
    q: "in:inbox",
    maxResults: 500, // Limit to 500 emails
  });

  if (!response.data.messages?.length) {
    console.log("No messages found in inbox");
    return;
  }

  console.log(`Found ${response.data.messages.length} messages to archive`);

  // Archive each message
  const promises = response.data.messages.map(async (message) => {
    return user.gmailClient.users.messages.modify({
      userId: "me",
      id: message.id!,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });
  });

  await Promise.all(promises);
  console.log(`Archived ${promises.length} messages`);
}

program.parse(process.argv);
