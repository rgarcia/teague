import { Vapi, VapiClient } from "@vapi-ai/server-sdk";
import { readFileSync } from "fs";
import path from "path";
const client = new VapiClient({ token: process.env.VAPI_API_KEY });

const systemPrompt = readFileSync(
  path.join(__dirname, "system-prompt.md"),
  "utf-8"
);

async function updateAssistant() {
  const assistants = await client.assistants.list();
  console.log("assistants", JSON.stringify(assistants, null, 2));

  const teague = assistants.find((assistant) => assistant.name === "Teague");
  if (!teague) {
    throw new Error("Teague assistant not found");
  }

  const updateRes = await client.assistants.update(teague.id, {
    model: {
      provider: "openai",
      model: "gpt-4o",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
      ],
      toolIds: [
        "a583fb39-ee7e-4239-b42d-24685926c4a8", // GetNextEmail
      ],
    },
    firstMessage: "Hello, want to get to inbox zero today?",
    voicemailMessage: "Hey this is Ava, can you call me back when you're free?",
    endCallMessage: "I think that's all for now, good bye!",
    transcriber: {
      keywords: ["inbox", "email", "cannon"],
      provider: "deepgram",
      language: "en-US",
      model: "nova-2-conversationalai",
      smartFormat: true,
    },
    clientMessages: [
      "conversation-update",
      "function-call",
      "function-call-result",
      "hang",
      "language-changed",
      "metadata",
      "model-output",
      "speech-update",
      "status-update",
      "transcript",
      "tool-calls",
      "tool-calls-result",
      "transfer-update",
      "user-interrupted",
      "voice-input",
    ],
    serverMessages: [
      "conversation-update",
      "end-of-call-report",
      "function-call",
      "hang",
      "speech-update",
      "status-update",
      "tool-calls",
      "transfer-destination-request",
      "user-interrupted",
    ],
    endCallPhrases: ["goodbye"],
  });

  console.log("updated teague", JSON.stringify(updateRes, null, 2));
}

async function updateTools() {
  const tools = await client.tools.list();
  console.log("tools", JSON.stringify(tools, null, 2));

  const getNextEmailDef = {
    type: "function",
    name: "GetNextEmail",
    async: false,
    messages: [
      {
        type: "request-start" as const,
        content: "Getting another email...",
      },
      {
        type: "request-complete" as const,
        content: "Email from ... about ...",
      },
      {
        type: "request-failed" as const,
        content:
          "I couldn't get the email information right now, please try again later.",
      },
      {
        type: "request-response-delayed" as const,
        content:
          "It appears there is some delay in communication with the email API.",
        timingMilliseconds: 2000,
      },
    ],
    server: {
      url: "https://raf--teague.ngrok.app/api/gmail/next-email",
    },
    function: {
      name: "GetNextEmail",
      description: "Gather the next email up for review from the user's inbox.",
      parameters: {
        type: "object" as const,
        properties: {
          maxResults: {
            type: "number" as const,
            description: "The maximum number of emails to return",
          },
          query: {
            type: "string" as const,
            description: "The email query to use. E.g., 'in:inbox'",
          },
        },
        required: ["maxResults", "query"],
      },
    },
  };
  const getNextEmail = tools.find(
    (tool) => tool.function?.name === "GetNextEmail"
  );
  if (!getNextEmail) {
    console.log("getNextEmail tool not found");
    const created = await client.tools.create(
      getNextEmailDef as Vapi.ToolsCreateRequest
    );
    console.log("created getNextEmail", JSON.stringify(created, null, 2));
  } else {
    console.log("updating getNextEmail");
    const updated = await client.tools.update(getNextEmail.id, {
      async: getNextEmailDef.async,
      function: getNextEmailDef.function,
      messages: getNextEmailDef.messages,
      server: getNextEmailDef.server,
    });
    console.log("updated getNextEmail", JSON.stringify(updated, null, 2));
  }
}

async function main() {
  await updateAssistant();
  //await updateTools();
}

main().catch(console.error);
