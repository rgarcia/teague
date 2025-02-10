import { Vapi, VapiClient } from "@vapi-ai/server-sdk";
import { readFileSync } from "fs";
import path from "path";
const client = new VapiClient({ token: process.env.VAPI_API_KEY });

const systemPrompt = readFileSync(
  path.join(__dirname, "system-prompt.md"),
  "utf-8"
);

async function updateAssistant(toolIds: string[]) {
  const assistants = await client.assistants.list();
  console.log(
    "Found assistants:",
    assistants.map((a) => ({ id: a.id, name: a.name }))
  );

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
      toolIds: toolIds,
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

  console.log("Updated Teague assistant:", {
    id: updateRes.id,
    name: updateRes.name,
    model: updateRes.model!.model,
    toolIds: updateRes.model!.toolIds,
  });
}

async function updateTools(): Promise<string[]> {
  const tools = await client.tools.list();
  console.log(
    "Found tools:",
    tools.map((t) => ({
      id: t.id,
      name: t.function?.name,
    }))
  );

  const getNextEmailDef = {
    type: "function",
    async: false,
    messages: [
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
      url: "https://raf--cannon.ngrok.app/api/gmail/next-email",
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
          pageToken: {
            type: "string" as const,
            description: "The page token to use for pagination",
          },
        },
        required: ["maxResults", "query"],
      },
    },
  };

  const archiveEmailDef = {
    type: "function",
    //    name: "ArchiveEmail",
    async: false,
    messages: [
      {
        type: "request-failed" as const,
        content:
          "I couldn't archive the email right now, please try again later.",
      },
      {
        type: "request-response-delayed" as const,
        content: "It appears there is some delay in archiving the email.",
        timingMilliseconds: 2000,
      },
    ],
    server: {
      url: "https://raf--cannon.ngrok.app/api/gmail/archive",
    },
    function: {
      name: "ArchiveEmail",
      description: "Archive a specific email from the user's inbox.",
      parameters: {
        type: "object" as const,
        properties: {
          messageId: {
            type: "string" as const,
            description: "The ID of the message to archive",
          },
        },
        required: ["messageId"],
      },
    },
  };

  const toolIds: string[] = [];

  const getNextEmail = tools.find(
    (tool) => tool.function?.name === "GetNextEmail"
  );
  if (!getNextEmail) {
    const created = await client.tools.create(
      getNextEmailDef as Vapi.ToolsCreateRequest
    );
    console.log("Created GetNextEmail tool:", {
      id: created.id,
      name: created.function?.name,
    });
    toolIds.push(created.id);
  } else {
    const updated = await client.tools.update(getNextEmail.id, {
      async: getNextEmailDef.async,
      function: getNextEmailDef.function,
      messages: getNextEmailDef.messages,
      server: getNextEmailDef.server,
    });
    console.log("Updated GetNextEmail tool:", {
      id: updated.id,
      name: updated.function?.name,
    });
    toolIds.push(updated.id);
  }

  const archiveEmail = tools.find(
    (tool) => tool.function?.name === "ArchiveEmail"
  );
  if (!archiveEmail) {
    const created = await client.tools.create(
      archiveEmailDef as Vapi.ToolsCreateRequest
    );
    console.log("Created ArchiveEmail tool:", {
      id: created.id,
      name: created.function?.name,
    });
    toolIds.push(created.id);
  } else {
    const updated = await client.tools.update(archiveEmail.id, {
      async: archiveEmailDef.async,
      function: archiveEmailDef.function,
      messages: archiveEmailDef.messages,
      server: archiveEmailDef.server,
    });
    console.log("Updated ArchiveEmail tool:", {
      id: updated.id,
      name: updated.function?.name,
    });
    toolIds.push(updated.id);
  }

  return toolIds;
}

async function main() {
  const toolIds = await updateTools();
  await updateAssistant(toolIds);
}

main().catch(console.error);
