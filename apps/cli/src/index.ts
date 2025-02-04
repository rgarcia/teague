import { openai } from "@ai-sdk/openai";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { createAgent } from "@statelyai/agent";
import addrparser from "address-rfc2822";
import { generateText, streamText } from "ai";
import { exec } from "child_process";
import { ElevenLabsClient } from "elevenlabs";
import { readFileSync, unlink } from "fs";
import type { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import kleur from "kleur";
import { ChatPromptClient, Langfuse } from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";
import OpenAI from "openai";
import player from "play-sound";
import prompts from "prompts";
import TurndownService from "turndown";
import { promisify } from "util";
import { v4 } from "uuid";
import { assign, createActor, fromPromise, setup } from "xstate";
import { TranscriptionServer } from "./server";

const execAsync = promisify(exec);
const openaiClient = new OpenAI();
const audioPlayer = player({});

// Initialize ElevenLabs client
if (!process.env.ELEVENLABS_API_KEY) {
  throw new Error("ELEVENLABS_API_KEY is not set");
}

console.log(process.env.ELEVENLABS_API_KEY);

const elevenLabsClient = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Function to create and play audio from text
async function speak(
  text: string,
  { noLog = false }: { noLog?: boolean } = {}
) {
  // First, log the message as before
  if (!noLog) {
    console.log(kleur.green(">"), text);
  }

  try {
    const res = await elevenLabsClient.textToSpeech.convert(
      "JBFqnCBsd6RMkjVDRZzb",
      {
        output_format: "mp3_44100_128",
        text,
        model_id: "eleven_multilingual_v2",
      }
    );

    const fileName = `${v4()}.mp3`;
    const f = Bun.file(fileName);
    const chunks = [];
    for await (const chunk of res) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    await f.write(buffer);

    // Play the audio
    await new Promise<void>((resolve, reject) => {
      audioPlayer.play(fileName, (error: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
    // Clean up the temporary file
    await promisify(unlink)(fileName);
  } catch (error) {
    console.error("Error in text-to-speech:", error);
    // Continue execution even if TTS fails
  }
}

// Initialize transcription server
const transcriptionServer = new TranscriptionServer({
  port: 3001,
  logFile: "transcription.log",
});

// Start the transcription server immediately
transcriptionServer.start().catch((error) => {
  console.error("Failed to start transcription server:", error);
  process.exit(1);
});
console.log(
  "[DEBUG] Transcription server started, open http://localhost:3001 if you would like to use voice"
);

// Handle graceful shutdown
function handleShutdown() {
  console.log("\nShutting down...");
  transcriptionServer.stop();
  process.exit(0);
}

// Add cleanup handlers
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
process.on("exit", () => {
  transcriptionServer.stop();
});

// Initialize OpenTelemetry and Langfuse
const requiredEnvVars = [
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_BASE_URL",
  "USER",
  "GOOGLE_APPLICATION_CREDENTIALS",
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

// Load the classification prompt at startup
const classificationPrompt = await langfuse.getPrompt(
  "classify-user-speech",
  undefined,
  { type: "chat", label: "production" }
);

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

function debug(...args: any[]) {
  console.log("[DEBUG]", ...args);
}

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

    debug("created filter:", JSON.stringify(filterConfig));
    await speak(`Created filter for emails from ${input.fromEmail}`);
  }
);

const unsubscribeEmail = fromPromise<void, { email: EmailMessage }>(
  async ({ input }) => {
    // Check for required headers
    const listUnsubscribe = input.email.payload?.headers?.find(
      (header) => header.name?.toLowerCase() === "list-unsubscribe"
    )?.value;

    const listUnsubscribePost = input.email.payload?.headers?.find(
      (header) => header.name?.toLowerCase() === "list-unsubscribe-post"
    )?.value;

    if (!listUnsubscribe || !listUnsubscribePost) {
      throw new Error("Cannot unsubscribe: missing required headers");
    }

    // Extract HTTPS URL from List-Unsubscribe header
    // Format is typically: <https://example.com/unsubscribe>, <mailto:...>
    const matches = listUnsubscribe.match(/<(https:\/\/[^>]+)>/);
    if (!matches) {
      throw new Error(
        "Cannot unsubscribe: no HTTPS URL found in List-Unsubscribe header"
      );
    }

    const unsubscribeUrl = matches[1];

    const res = await fetch(unsubscribeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "List-Unsubscribe=One-Click",
    });

    if (!res.ok) {
      throw new Error(`Failed to unsubscribe: ${res.statusText}`);
    }
    console.log("[DEBUG] successful post to unsubscribe url:", unsubscribeUrl);
    await speak("Unsubscribed from email");
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
      | { type: "agent.userChoiceFilter" }
      | { type: "agent.userChoiceUnsubscribe" }
      | { type: "agent.userChoiceFilterAfterUnsubscribe"; value: boolean }
      | { type: "agent.userChoiceFeedback" }
      | {
          type: "agent.userFeedbackREceived";
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
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAOinQBdswAnAOTAA8KBRDXAGwGIIB7QkgQBuvANZgSaLHkKlyVWg2Zt0nBMN6ZKufgG0ADAF0DhxKAAOvWLgo78ZkI0QBaAIwBWAGz6S31-oBOAHYAZn0AJk9wkPCAGhAATxcA-RCScKD9ABYg1yyQrIAOQv0ggF8y+KkcAmISHDBMUQAJdFgVTi4TB0trW34HJwQ3d3CffQigr0zXcICsz3ik4c9gkg93QoCQgIDw9yys9wqqjBrZeuom1vb2bl1XUyQQXps7QZdXTPHtkMLXQrhDJfLJLFyrILrdybba7faHLInEDVGR1WAAV1QGBouAAXgQoFx0DB8BQSGA7gBlTHYhIAETAHFwQlokG6z1e-XszyGI08kP0qwCrjyRX+YOGRR8IS88PcuWCC08SJRtVIbVEAFVYLQiSSyeidTQAMLYXi4TBgSmiXDmdkWKxvAY8z4hIKeEiZBaHfbQzzyiXOEJukj6A5eCZBaJZAKFEIqs6o9WwLVGvVgUkkQ20U3my0AQRoNRZ9pejq5H2GrjdhRI8tS7lcUWDUcDcw97sKWTGoRyBWyCekapIGu1uuJGYNRtzFrAADFOBRaKXOe8XVW3QESEcFuEisDQq42zE68Kpnvips4-HKsjE8PR2mJ5nsyazbPNfgMQAjWCYHHfmAK7lmuoC8tWAQeoU7jbEEASbLK+SBgCkJbHMXjdl2jaxoO5x1I+476lm07vpac5gJA35YKIwF9KBjifIUngeoKgTuhBpTuIG+Q+ICwqrI2bHBLhSYjkWeBCASPD8BIGjiJI94XOg4nMgS6j4CIWhciYtFOtyYGfKU4weBkYZMU2R6JOCawpDCOwlM25S3qqFwAGaLrQUl8AIckSC5dTuRwS44vgUDqZp2h6EYukVuubiCh6MGQfo1bQsGbZjJ6MTQjkTF-NWiLOYpdTol+6K-v+uDfl5MmCBpYh+cVpClT+f4AWpGhaXYOlGD0IHOgZwxbOMMFbB4WSuPB-LISErihv6+SNiE-r7ICInDi15VtVVUm0DQvA0CQ5gcJQrkHagClDhcm0Ve1oXhZokX4D1TwOnRA0McMQSFJCGSjP8hxwoc3FpE20H8gUwbVuE61KSmAAqvALkFhGTsROakfOHk0PmrnBZ+rWVYBMX0bynhMduEzbFE5PhP4QTIfyp4eFMEyHICXiw-hCNI9j6YviReZYyjON47QBNbUTQGPH1736Z9ziZOE25waU9NZIEs1tpBnrk92pQFL2FS3vgvAQHADj+UQst6ZWbjzO425Coe-GAshIpZCQwp7jEdObkETmnFddTyNQ9BMKwdw27Fg0jEEnsxJ4Tbx8tuxhshES1nk+hdmGkHypsXOkA01xtB0HDR6TnzuIEJCzWGSc58xBSglZX3uuk-iCv21ZNsqRXB6QGJYspeIEpXH3gTXPieMGwT+mE-qxoGBde7GOeRBeIqFEXI4pmONAT-L4FFGk0IZH9-qBG7bdBlsoYxAsP2xpEhcD3h6oqZJoVH3b-hxp6DWkRijdlmAEQM2VtwAh2IJaI7gbxBw-iQQKwVx4cn6sfQyJR1gmQKOTTwMY3TIVCHXNiOVyawQQXeQeWYyq3R2j-dBcs-6BC3KUKIGtsrFEgtxR2PoIgpGCMKYR-dEGiQ1IjZGwVf5xQOGkFIUp3T7n5AzW+dMvYTVjCkYM+RmJdl3t5MAMjY4AjWAsXYLswZxFvlGZWgiUrfTGKZGGxsgA */
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
          target: "givingFeedback",
        },
      },
    },
    givingFeedback: {
      on: {
        "agent.userFeedbackREceived": {
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
        input: ({ context }) => ({
          email: context.currentEmail!,
        }),
        onDone: "archiving",
        onError: {
          target: "askToFilter",
          actions: async () => {
            await speak(
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
      entry: async () => {
        await speak("No more emails to process!");
        process.exit(0);
      },
    },
  },
});

async function recordAndTranscribe(): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(
      kleur.yellow("> "),
      "Starting recording... Press any key to stop."
    );

    // Send command to start recording
    transcriptionServer.sendCommand({ type: "start-recording" });

    let finalTranscription: string | null = null;
    let isCleanedUp = false;

    // Set up transcription handler
    const handleTranscription = (transcription: string) => {
      finalTranscription = transcription;
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      // Remove all listeners
      transcriptionServer.removeListener(
        "final-transcription",
        handleTranscription
      );
      transcriptionServer.removeListener("error", handleError);
      process.stdin.removeListener("data", handleKeyPress);
      // Restore stdin to its previous mode
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    // Handle any key press
    const handleKeyPress = () => {
      transcriptionServer.sendCommand({ type: "stop-recording" });

      // Wait a bit for any final transcription to come in
      setTimeout(() => {
        cleanup();
        if (finalTranscription) {
          console.log("[DEBUG] transcription:", finalTranscription);
          resolve(finalTranscription);
        } else {
          console.log("[DEBUG] No transcription received");
          reject(new Error("No transcription received"));
        }
      }, 1000);
    };

    // Set up stdin to listen for any key
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", handleKeyPress);

    // Listen for transcription events
    transcriptionServer.on("final-transcription", handleTranscription);
    transcriptionServer.on("error", handleError);
  });
}

async function classifyUserSpeech(
  transcription: string
): Promise<"skip" | "archive" | "filter" | "unsubscribe" | "give feedback"> {
  const availableActions = [
    "skip",
    "archive",
    "filter",
    "unsubscribe",
    "give feedback",
  ] as const;

  const prompt = classificationPrompt.compile({
    transcription,
    classes: availableActions.map((action) => `- ${action}`).join("\n"),
  });

  const { text } = await generateText({
    model: agent.model,
    system: prompt[0].content,
    prompt: prompt[1].content,
    experimental_telemetry: {
      isEnabled: true,
      metadata: {
        langfusePrompt: classificationPrompt.toJSON(),
        langfuseUpdateParent: true,
        sessionId,
        tags: [`env:local-${process.env.USER}`],
      },
    },
  });

  const action = text.trim().toLowerCase();
  if (!availableActions.includes(action as any)) {
    throw new Error(`Could not classify speech into a valid action: ${action}`);
  }

  await speak(`OK, I'll ${action}.`);

  return action as (typeof availableActions)[number];
}

// Handle user input through either voice or prompts
function sendActionEvent(
  actor: any,
  action: "skip" | "archive" | "filter" | "unsubscribe" | "give feedback"
) {
  switch (action) {
    case "skip":
      actor.send({ type: "agent.userChoiceSkip" });
      break;
    case "archive":
      actor.send({ type: "agent.userChoiceArchive" });
      break;
    case "filter":
      actor.send({ type: "agent.userChoiceFilter" });
      break;
    case "unsubscribe":
      actor.send({ type: "agent.userChoiceUnsubscribe" });
      break;
    case "give feedback":
      actor.send({ type: "agent.userChoiceFeedback" });
      break;
  }
}

async function handleUserInput(actor: any) {
  const response = await prompts([
    {
      type: "select",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { title: "🎤 Speak", value: "speak" },
        { title: "Skip", value: "skip" },
        { title: "Archive", value: "archive" },
        { title: "Filter", value: "filter" },
        { title: "Unsubscribe", value: "unsubscribe" },
        { title: "Give Feedback", value: "give feedback" },
      ],
    },
  ]);

  if (response.action === "speak") {
    try {
      const transcription = await recordAndTranscribe();
      const action = await classifyUserSpeech(transcription);
      sendActionEvent(actor, action);
    } catch (error) {
      console.error(
        kleur.red("> "),
        "Failed to process speech input - please try again"
      );
      void handleUserInput(actor);
    }
  } else {
    sendActionEvent(actor, response.action);
  }
}

async function handleFeedbackInput(actor: any) {
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
    type: "agent.userFeedbackREceived",
    feedback: {
      thumb: feedback.thumb,
      comment: feedback.comment,
    },
  });
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
        email: sanitizeForSummary(observed.state.context.currentEmail!),
        previousNegativeFeedback: JSON.stringify(
          observed.state.context.negativeFeedback
        ),
      });
      if (prompt.length !== 2 || prompt[0].role !== "system") {
        throw new Error("Expected a chat prompt with system message first");
      }

      const { textStream, text } = streamText({
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
      await speak(await text, { noLog: true });
      actor.send({
        type: "agent.emailSummaryDelivered",
      });
    })();
  } else if (observed.state.matches("askUser")) {
    void handleUserInput(actor);
  } else if (observed.state.matches("givingFeedback")) {
    void handleFeedbackInput(actor);
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
