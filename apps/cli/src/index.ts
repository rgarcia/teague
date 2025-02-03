import { openai } from "@ai-sdk/openai";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { createAgent } from "@statelyai/agent";
import { streamText } from "ai";
import { readFileSync } from "fs";
import type { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import kleur from "kleur";
import { ChatPromptClient, Langfuse } from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";
import prompts from "prompts";
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
      | {
          type: "agent.userChoiceFeedback";
          feedback: { thumb: "up" | "down"; comment: string };
        }
      | { type: "agent.emailSummaryDelivered" },
  },
  guards: {
    hasMoreEmails: ({ context }) =>
      Boolean(context.currentEmail || context.nextPageToken),
  },
  actors: {
    gmailMessagesListAndGet,
    archiveEmail,
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOinQBdswAnAOTAA8KBRDXAGwGIIB7QkgQBuvANZgSaLHkKlyVWg2Zt0nBMN6ZKufgG0ADAF0DhxKAAOvWLgo78ZkI0QBaAIwBWAGz6S31-oBOAHYAZn0AJk9wkPCAGhAATxcA-RCScKD9ABYg1yyQrIAOQv0ggF8y+KkcAmISHDBMUQAJdFgVTi4TB0trW34HJwQ3d3CffQigr0zXcICsz3ik4c9gkg93QoCQgIDw9yys9wqqjBrZeuom1vb2bl1XUyQQXps7QZdXTPHtkMLXQrhDJfLJLFyrILrdybba7faHLInEDVGR1WAAV1QGBouAAXgQoFx0DB8BQSGA7gBlTHYhIAETAHFwQlokG6z1e-XszyGI08kP0qwCrjyRX+YOGRR8IS88PcuWCC08SJRtVIbVEAFVYLQiSSyeidTQAMLYXi4TBgSmiXDmdkWKxvAY8z4hIKeEiZBaHfbQzzyiXOEJukj6A5eCZBaJZAKFEIqs6o9WwLVGvVgUkkQ20U3my0AQRoNRZ9pejq5H2GrjdhRI8tS7lcUWDUcDcw97sKWTGoRyBWyCekapIGu1uuJGYNRtzFrAADEwJAAEZYUSlznvF1VruuEhHJsTEKrTaFIKBxse9yC32jGKeGOD851dBFvBCAk8fgSDTiSSJ4cvsWBLqPgIhaFyJjruWm6gLy-iZKGHgZGGhSeE2riBhCJApDCOwlM25RIvgvAQHADiqrIPTQc6sGfPM7h7kKoSuMKniAoGIoeOkBQwsEjaKo+SZkJQ1D0EwrB3FRfQwY4nzylkJB3k2QT5EKYYcREtZ5PoXZhgE-pTIUgnDg01xtB0HBSU63K0VWV4BIp-heP4qGeAUoKJC4QTuuk-iCv21ZNsqlTIv+FwYliL54gSVkVluIwTL4wbBP6YT+rG55TNhsY6ZE4RFCKRkhRRz4pmONCxTJcFFGk0IZBkXj2exnnDH8DmpPlbFBLGkSbMZFyAW+MUctRNmyVWOlpCpERsV24SzAEgYxAxWQAjsjYRDK8bFWFdR8IQlU0eNbhbJCCy7MxrHNcszhRuE2GBPoXyApMEQVBUQA */
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
    done: {
      entry: () => {
        console.log("No more emails to process!");
        process.exit(0);
      },
    },
  },
});

function wrapInXml(tagName: string, content: string): string {
  return `<${tagName}>${content}</${tagName}>`;
}

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
        email: JSON.stringify(observed.state.context.currentEmail),
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
        prompt:
          "Summarize the following email " +
          wrapInXml(
            "email",
            JSON.stringify(observed.state.context.currentEmail)
          ),
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
      }
    })();
  }
});

actor.start();

// Add cleanup on exit
process.on("exit", async () => {
  await langfuse.flushAsync();
  await sdk.shutdown();
});
