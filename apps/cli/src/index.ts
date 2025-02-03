import { openai } from "@ai-sdk/openai";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { createAgent } from "@statelyai/agent";
import addrparser from "address-rfc2822";
import { streamText } from "ai";
import { readFileSync } from "fs";
import type { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import kleur from "kleur";
import { ChatPromptClient, Langfuse } from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";
import prompts from "prompts";
import TurndownService from "turndown";
import { v4 } from "uuid";
import { assign, createActor, fromPromise, setup } from "xstate";

// Initialize OpenTelemetry and Langfuse
const requiredEnvVars = [
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_BASE_URL",
  "USER",
];
for (const requiredEnvVar of requiredEnvVars) {
  if (!process.env[requiredEnvVar]) {
    throw new Error(`${requiredEnvVar} is not set`);
  }
}

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL!,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL!,
});

const sessionId = v4();

const auth = google.auth.fromJSON(
  JSON.parse(
    readFileSync(process.cwd() + "/../../packages/auth/token.json", "utf-8")
  )
) as OAuth2Client;
const gmail: gmail_v1.Gmail = google.gmail({ version: "v1", auth });

type EmailMessage = gmail_v1.Schema$Message;

const gmailMessagesListAndGet = fromPromise<
  {
    nextPageToken?: string;
    message?: EmailMessage;
  },
  gmail_v1.Params$Resource$Users$Messages$List
>(async ({ input }) => {
  const res = await gmail.users.messages.list(input);
  if (res.status !== 200) {
    throw new Error(`Failed to list messages: ${res.statusText}`);
  }

  const nextPageToken = res.data.nextPageToken ?? undefined;

  if (!res.data.messages || res.data.messages.length === 0) {
    return { nextPageToken, message: undefined };
  }

  const messageRes = await gmail.users.messages.get({
    userId: "me",
    id: res.data.messages[0].id!,
    format: "full",
  });

  if (messageRes.status !== 200) {
    throw new Error(`Failed to get message: ${messageRes.statusText}`);
  }

  return {
    nextPageToken,
    message: messageRes.data,
  };
});

const archiveEmail = fromPromise<void, { messageId: string }>(
  async ({ input }) => {
    const res = await gmail.users.messages.modify({
      userId: "me",
      id: input.messageId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });

    if (res.status !== 200) {
      throw new Error(`Failed to archive message: ${res.statusText}`);
    }
  }
);

const createFilter = fromPromise<void, { fromEmail: string }>(
  async ({ input }) => {
    if (!input.fromEmail) {
      throw new Error("Cannot create filter: from email is empty");
    }

    const filterConfig = {
      criteria: {
        from: input.fromEmail,
      },
      action: {
        removeLabelIds: ["INBOX"],
      },
    };

    const res = await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: filterConfig,
    });
    if (res.status !== 200) {
      throw new Error(`Failed to create filter: ${res.statusText}`);
    }

    console.log(
      "[DEBUG] created filter:",
      JSON.stringify(filterConfig, null, 2)
    );
    console.log(
      kleur.green("> "),
      "Created filter for emails from",
      input.fromEmail
    );
  }
);

const unsubscribeEmail = fromPromise<void, { unsubscribeUrl: string }>(
  async ({ input }) => {
    const res = await fetch(input.unsubscribeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "List-Unsubscribe=One-Click",
    });

    if (!res.ok) {
      throw new Error(`Failed to unsubscribe: ${res.statusText}`);
    }
    console.log(
      "[DEBUG] successful post to unsubscribe url: ",
      input.unsubscribeUrl
    );
    console.log(kleur.green("> "), "Unsubscribed from email");
  }
);

function canUnsubscribe(message: EmailMessage): {
  canUnsubscribe: boolean;
  unsubscribeUrl?: string;
} {
  const listUnsubscribe = message.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === "list-unsubscribe"
  )?.value;

  const listUnsubscribePost = message.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === "list-unsubscribe-post"
  )?.value;

  if (!listUnsubscribe || !listUnsubscribePost) {
    return { canUnsubscribe: false };
  }

  // Extract HTTPS URL from List-Unsubscribe header
  // Format is typically: <https://example.com/unsubscribe>, <mailto:...>
  const matches = listUnsubscribe.match(/<(https:\/\/[^>]+)>/);
  if (!matches) {
    return { canUnsubscribe: false };
  }

  return {
    canUnsubscribe: true,
    unsubscribeUrl: matches[1],
  };
}

const agent = createAgent({
  model: openai("gpt-4o"),
  events: {},
});

const machine = setup({
  types: {
    context: {} as {
      currentEmail?: EmailMessage;
      nextPageToken?: string;
      traceId?: string;
      negativeFeedback: string[];
    },
    events: {} as
      | { type: "agent.userChoiceSkip" }
      | { type: "agent.userChoiceArchive" }
      | { type: "agent.userChoiceFilter" }
      | { type: "agent.userChoiceUnsubscribe" }
      | { type: "agent.userChoiceFilterAfterUnsubscribe"; value: boolean }
      | {
          type: "agent.userChoiceFeedback";
          feedback: { thumb: "up" | "down"; comment: string };
        }
      | { type: "agent.emailSummaryDelivered" },
  },
  guards: {
    hasMoreEmails: ({ context }) =>
      Boolean(context.currentEmail || context.nextPageToken),
    userWantsToFilter: ({ event }) => "value" in event && event.value === true,
    userDoesNotWantToFilter: ({ event }) =>
      "value" in event && event.value === false,
  },
  actors: {
    gmailMessagesListAndGet,
    archiveEmail,
    createFilter,
    unsubscribeEmail,
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOinQBdswAnAOTAA8KBRDXAGwGIIB7QkgQBuvANZgSaLHkKlyVWg2Zt0nBMN6ZKufgG0ADAF0DhxKAAOvWLgo78ZkI0QBaAIwBWAGz6S31-oBOAHYAZn0AJk9wkPCAGhAATxcA-RCScKD9ABYg1yyQrIAOQv0ggF8y+KkcAmISHDBMUQAJdFgVTi4TB0trW34HJwQ3d3CffQigr0zXcICsz3ik4c9gkg93QoCQgIDw9yys9wqqjBrZeuom1vb2bl1XUyQQXps7QZdXTPHtkMLXQrhDJfLJLFyrILrdybba7faHLInEDVGR1WAAV1QGBouAAXgQoFx0DB8BQSGA7gBlTHYhIAETAHFwQlokG6z1e-XszyGI08kP0qwCrjyRX+YOGRR8IS88PcuWCC08SJRtVIbVEAFVYLQiSSyeidTQAMLYXi4TBgSmiXDmdkWKxvAY8z4hIKeEiZBaHfbQzzyiXOEJukj6A5eCZBaJZAKFEIqs6o9WwLVGvVgUkkQ20U3my0AQRoNRZ9pejq5H2GrjdhRI8tS7lcUWDUcDcw97sKWTGoRyBWyCekapIGu1uuJGYNRtzFrAADFOBRaKXOe8XVW3QESEcFuEisDQq42zE68Kpnvips4-HKsjE8PR2mJ5nsyazbPNfgMQAjWCYHHfmAK7lmuoC8tWAQeoU7jbEEASbLK+SBgCkJbHMXjdl2jaxoO5x1I+476lm07vpac5gJA35YKIwF9KBjifF2rjbo23ipKsV5BIGrF1oKvqjDEngxrhSYjkWeBCASPD8BIGjiJI94XOg4nMgS6j4CIWhciYtFOtyYGfKU4weBkYaFJ4TZHok4JrCkMI7CUzblLeqoXAAZoutBSXwAhyRIrl1B5HBLji+BQOpmnaHoRi6RW65uIKHowZB+jVtCwZtmMnoxNCOTmX81aIi5il1OiX7or+-64N+3kyYIGliP5JWkGVP5-gBakaFpdg6UYPQgc6BnDFs4wwVsHhZK48H8shITMYKBwytW-r7ICInDq1FXtdVUm0DQvA0CQ5gcJQbkHagClDhcm2VR1YURZoUX4L1TwOnRg0McMQSFJCGSjP8hxwocgb5OsnjQfyBTBtW4TrUpKYACq8AuwWEZOxE5qR86eTQ+ZuSFn5tVVgGxfRvLgx6WQTNsUTg+E-hcdZVb8qeHhTBMhyAl4cP4YjyM4+mL4kXm2Oo7j+O0ITW3E0Bjz9e9+mfc4mThNucGlAzVPbFZyzOO2nrg92pQFL2FS3vgvAQHADgBUQ8t6ZWbjzO425Coewp08hIou0J+jQRMmyZPBPNyJQ1D0EwrB3PbcVDSMQRZCQglNgnIRCmGyERLWeR+1TMH+lMhQh5cjQtG0HQcDHZOfO4gRJ-4Xj+OZngFKCTPK+66T+IK-bVk2yrFVdaI0speIElXH3gbXPgtzs7ruGE-qxtxUwkLsJSAlERQikXg94cmqa0BPivgUUaTQhkf3+oEgKBn8W6pHu4NwZvmzF8pxbjxyA0n4ZcaelTSIxRuyzACHffY24AQ7EbBEGUN5ThD1IEFEKX83oO3ik3Hw3towUxjG6ZCoQk6BCmAccGsF4F3kQVmcqt0dphWPo7fwuxQzuj3I-K8kEQYux9BEFIwRhQCIHgg-eI4+YoxCgw+Ki017ZBKO6fc-JGa63pmvSasYUjBnyJ4Q2xcfJgEkXHAEawFi7Hdk2W+7coyqz4alb6YxTKwzNkAA */
  context: {
    currentEmail: undefined,
    nextPageToken: undefined,
    traceId: undefined,
    negativeFeedback: [],
  },
  initial: "gatherNextEmail",
  states: {
    gatherNextEmail: {
      invoke: {
        src: "gmailMessagesListAndGet",
        input: ({ context }) => ({
          userId: "me",
          q: "in:inbox",
          maxResults: 1,
          pageToken: context.nextPageToken,
        }),
        onDone: {
          target: "checkHasEmail",
          actions: assign({
            currentEmail: ({ event }) => event.output.message,
            nextPageToken: ({ event }) => event.output.nextPageToken,
            traceId: () => v4(),
          }),
        },
      },
    },
    checkHasEmail: {
      always: [
        {
          guard: "hasMoreEmails",
          target: "summarizing",
        },
        {
          target: "done",
        },
      ],
    },
    summarizing: {
      on: {
        "agent.emailSummaryDelivered": {
          target: "askUser",
        },
      },
    },
    askUser: {
      on: {
        "agent.userChoiceSkip": {
          target: "gatherNextEmail",
        },
        "agent.userChoiceArchive": {
          target: "archiving",
        },
        "agent.userChoiceFilter": {
          target: "filtering",
        },
        "agent.userChoiceUnsubscribe": {
          target: "unsubscribing",
        },
        "agent.userChoiceFeedback": {
          target: "summarizing",
          actions: [
            ({ event, context }) => {
              langfuse.score({
                traceId: context.traceId!,
                name: "email-summary-feedback",
                value: event.feedback.thumb === "up" ? 1 : 0,
                dataType: "BOOLEAN",
                comment: event.feedback.comment,
              });
            },
            assign({
              negativeFeedback: ({ context, event }) =>
                event.feedback.thumb === "down"
                  ? [...context.negativeFeedback, event.feedback.comment]
                  : context.negativeFeedback,
            }),
          ],
        },
      },
    },
    archiving: {
      invoke: {
        src: "archiveEmail",
        input: ({ context }) => ({
          messageId: context.currentEmail!.id!,
        }),
        onDone: "gatherNextEmail",
      },
    },
    filtering: {
      invoke: {
        src: "createFilter",
        input: ({ context }) => {
          const fromHeader = context.currentEmail?.payload?.headers?.find(
            (header) => header.name?.toLowerCase() === "from"
          )?.value;

          if (!fromHeader) {
            throw new Error("No from header found in email");
          }

          const addresses = addrparser.parse(fromHeader);
          if (!addresses || addresses.length === 0) {
            throw new Error("Could not parse from address");
          }

          const fromEmail = addresses[0].address;
          if (!fromEmail) {
            throw new Error("No email address found in from header");
          }

          return { fromEmail };
        },
        onDone: "archiving",
      },
    },
    unsubscribing: {
      invoke: {
        src: "unsubscribeEmail",
        input: ({ context }) => {
          const unsubscribeInfo = canUnsubscribe(context.currentEmail!);
          if (
            !unsubscribeInfo.canUnsubscribe ||
            !unsubscribeInfo.unsubscribeUrl
          ) {
            throw new Error("Cannot unsubscribe from this email");
          }
          return { unsubscribeUrl: unsubscribeInfo.unsubscribeUrl };
        },
        onDone: "archiving",
        onError: {
          target: "askToFilter",
          actions: () => {
            console.log(
              kleur.red("> "),
              "Could not unsubscribe - would you like to create a filter instead?"
            );
          },
        },
      },
    },
    askToFilter: {
      on: {
        "agent.userChoiceFilterAfterUnsubscribe": [
          {
            guard: "userWantsToFilter",
            target: "filtering",
          },
          {
            guard: "userDoesNotWantToFilter",
            target: "archiving",
          },
        ],
      },
    },
    done: {
      entry: () => {
        console.log(kleur.green("> "), "No more emails to process!");
        process.exit(0);
      },
    },
  },
});

const actor = createActor(machine);
agent.interact(actor, (observed) => {
  if (observed.state.matches("summarizing")) {
    void (async () => {
      const summarizePrompt: ChatPromptClient = await langfuse.getPrompt(
        "summarize-email",
        undefined,
        { type: "chat", label: "production" }
      );
      const prompt = summarizePrompt.compile({
        email: sanitizeForSummary(observed.state.context.currentEmail!),
        previousNegativeFeedback: JSON.stringify(
          observed.state.context.negativeFeedback
        ),
      });
      if (prompt.length !== 2 || prompt[0].role !== "system") {
        throw new Error("Expected a chat prompt with system message first");
      }

      const { textStream } = streamText({
        model: agent.model,
        system: prompt[0].content,
        prompt: prompt[1].content,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            langfusePrompt: summarizePrompt.toJSON(),
            langfuseTraceId: observed.state.context.traceId!,
            langfuseUpdateParent: true,
            sessionId,
            tags: [`env:local-${process.env.USER}`],
          },
        },
      });

      let first = true;
      for await (const textPart of textStream) {
        if (first) {
          process.stdout.write(kleur.bold().green("> "));
          first = false;
        }
        process.stdout.write(textPart);
      }
      process.stdout.write("\n");
      actor.send({
        type: "agent.emailSummaryDelivered",
      });
    })();
  } else if (observed.state.matches("askUser")) {
    void (async () => {
      const response = await prompts([
        {
          type: "select",
          name: "action",
          message: "What would you like to do?",
          choices: [
            { title: "Skip", value: "skip" },
            { title: "Archive", value: "archive" },
            { title: "Filter", value: "filter" },
            { title: "Unsubscribe", value: "unsubscribe" },
            { title: "Give Feedback", value: "feedback" },
          ],
        },
      ]);

      if (response.action === "feedback") {
        const feedback = await prompts([
          {
            type: "select",
            name: "thumb",
            message: "How was the summary?",
            choices: [
              { title: "👍", value: "up" },
              { title: "👎", value: "down" },
            ],
          },
          {
            type: "text",
            name: "comment",
            message: "Any additional feedback?",
          },
        ]);

        actor.send({
          type: "agent.userChoiceFeedback",
          feedback: {
            thumb: feedback.thumb,
            comment: feedback.comment,
          },
        });
      } else if (response.action === "skip") {
        actor.send({
          type: "agent.userChoiceSkip",
        });
      } else if (response.action === "archive") {
        actor.send({
          type: "agent.userChoiceArchive",
        });
      } else if (response.action === "filter") {
        actor.send({
          type: "agent.userChoiceFilter",
        });
      } else if (response.action === "unsubscribe") {
        actor.send({
          type: "agent.userChoiceUnsubscribe",
        });
      }
    })();
  } else if (observed.state.matches("askToFilter")) {
    void (async () => {
      const response = await prompts([
        {
          type: "confirm",
          name: "shouldFilter",
          message: "Would you like to create a filter for this sender instead?",
          initial: true,
        },
      ]);

      actor.send({
        type: "agent.userChoiceFilterAfterUnsubscribe",
        value: response.shouldFilter,
      });
    })();
  }
});

actor.start();

// Add cleanup on exit
process.on("exit", async () => {
  await langfuse.flushAsync();
  await sdk.shutdown();
});

function sanitizeForSummary(message: EmailMessage): string {
  // Create a deep copy to avoid mutating the original
  const sanitized: EmailMessage = JSON.parse(JSON.stringify(message));
  const turndownService = new TurndownService();

  // Build header section
  const relevantHeaders = [
    "from",
    "to",
    "subject",
    "date",
    "cc",
    "bcc",
    "reply-to",
    "message-id",
    "references",
    "content-type",
    "unsubscribe",
  ];

  let output = "";

  if (sanitized.payload?.headers) {
    const headers = sanitized.payload.headers
      .filter(
        (header) =>
          header.name && relevantHeaders.includes(header.name.toLowerCase())
      )
      .map((header) => `${header.name}: ${header.value}`)
      .join("\n");

    output += headers + "\n";
  }

  // Get content type from headers
  const contentType =
    sanitized.payload?.headers
      ?.find((header) => header.name?.toLowerCase() === "content-type")
      ?.value?.toLowerCase() ?? "";

  // Figure out the best text representation of the email for the llm
  // Handle both multipart and non-multipart messages
  let content = "";

  // Case 1: Direct content in payload.body (non-multipart messages)
  if (sanitized.payload?.body?.data) {
    try {
      const decodedContent = Buffer.from(
        sanitized.payload.body.data,
        "base64"
      ).toString("utf-8");
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
  else if (sanitized.payload?.parts) {
    const textParts: gmail_v1.Schema$MessagePart[] = [];
    const atLeastOneTextPlainPart = sanitized.payload.parts.some(
      (part) => part.mimeType === "text/plain"
    );
    if (atLeastOneTextPlainPart) {
      textParts.push(
        ...(sanitized.payload.parts.filter(
          (part) => part.mimeType === "text/plain"
        ) ?? [])
      );
    } else {
      textParts.push(
        ...sanitized.payload.parts.filter((part) =>
          part.mimeType?.startsWith("text/")
        )
      );
    }

    // Get content from relevant parts
    content = textParts
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

  if (content) {
    output += "---\n" + content;
  }

  return output;
}
