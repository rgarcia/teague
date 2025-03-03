import { VapiClient } from "@vapi-ai/server-sdk";
import {
  DeepgramTranscriberModel,
  UpdateAssistantDto,
} from "@vapi-ai/server-sdk/api";
import { mkdirSync, writeFileSync } from "fs";
import { Langfuse } from "langfuse";
import path from "path";
import toolRegistry from "~/utils/tools/all-tools";
import { createVapiToolDefinition } from "~/utils/tools/vapi-adapter";

const client = new VapiClient({ token: process.env.VAPI_API_KEY });
const langfuse = new Langfuse({
  baseUrl: process.env.LANGFUSE_BASE_URL,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
});

let systemPrompt: string;
const systemPromptGet = await langfuse.getPromptStateless(
  "system-prompt",
  undefined,
  "production"
);
if (systemPromptGet.fetchResult !== "success") {
  throw new Error("Failed to get system prompt from langfuse");
} else if (systemPromptGet.data.type !== "chat") {
  throw new Error("System prompt is not a chat prompt");
} else {
  const systemPromptEntry = systemPromptGet.data.prompt.find(
    (p) => p.role === "system"
  );
  if (!systemPromptEntry) {
    throw new Error("System prompt not found");
  }
  systemPrompt = systemPromptEntry.content;
}

writeFileSync(
  path.join("scripts", "system-prompt.md"),
  "<!-- DO NOT EDIT - This file is automatically synced down from Langfuse (that is where edits should be made) -->\n\n" +
    systemPrompt
);

// when dev'ing locally. TODO: make a separate assistant + tools for this
// const WEB_BASE_URL = "https://raf--cannon.ngrok.app";
const WEB_BASE_URL = "https://prod--web.raf.xyz";

async function dumpState(timestamp: string, prefix: string) {
  const tools = await client.tools.list();
  const assistants = await client.assistants.list();
  const blitz =
    assistants.find((assistant) => assistant.name === "Blitz") || "";

  // Create dumps directory if it doesn't exist
  const dumpsDir = path.join("scripts", "dumps", timestamp);
  mkdirSync(dumpsDir, { recursive: true });

  // Dump tools
  writeFileSync(
    path.join(dumpsDir, `${prefix}-tools.json`),
    JSON.stringify(tools, null, 2)
  );

  // Dump assistant
  writeFileSync(
    path.join(dumpsDir, `${prefix}-assistant.json`),
    JSON.stringify(blitz, null, 2)
  );
}

async function updateAssistant(toolIds: string[]) {
  const assistants = await client.assistants.list();
  console.log(
    "Found assistants:",
    assistants.map((a) => ({ id: a.id, name: a.name }))
  );

  const assistantSpec = {
    model: {
      // provider: "openai",
      // model: "gpt-4o",
      provider: "google" as const,
      // @ts-ignore
      model: "gemini-2.0-flash",
      temperature: 0.7,
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
        {
          role: "user" as const,
          content: "Let's go through my inbox.",
        },
      ],
      toolIds: toolIds,
    },
    startSpeakingPlan: {
      smartEndpointingEnabled: true,
      waitSeconds: 0.8,
    },
    backgroundSound: "off",
    stopSpeakingPlan: {
      numWords: 1,
      voiceSeconds: 0.2,
      backoffSeconds: 1,
    },
    modelOutputInMessagesEnabled: true,
    backgroundDenoisingEnabled: true,
    firstMessageMode: "assistant-speaks-first-with-model-generated-message",
    //firstMessage: "Let's go through your inbox.",
    voicemailMessage:
      "Hey this is Blitz, can you call me back when you're free?",
    endCallMessage: "I think that's all for now, good bye!",
    transcriber: {
      keywords: ["inbox", "email", "blitz"],
      provider: "deepgram" as const,
      language: "en-US" as const,
      model: "nova-3-general" as DeepgramTranscriberModel,
      smartFormat: false,
    },
    clientMessages: [
      "conversation-update",
      "function-call",
      "function-call-result",
      "hang",
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
    silenceTimeoutSeconds: 60,
  } as UpdateAssistantDto;

  const blitz = assistants.find((assistant) => assistant.name === "Blitz");
  if (!blitz) {
    const created = await client.assistants.create({
      name: "Blitz",
      ...assistantSpec,
    });
    console.log("Created Blitz assistant:", {
      id: created.id,
      name: created.name,
      model: created.model!.model,
      toolIds: created.model!.toolIds,
    });
  } else {
    const updateRes = await client.assistants.update(blitz.id, assistantSpec);

    console.log("Updated Blitz assistant:", {
      id: updateRes.id,
      name: updateRes.name,
      model: updateRes.model!.model,
      toolIds: updateRes.model!.toolIds,
    });
  }
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

  const toolIds: string[] = [];
  const registeredTools = toolRegistry.getAllTools();

  for (const tool of registeredTools) {
    const existingTool = tools.find((t) => t.function?.name === tool.name);
    const vapiConfig = {
      serverUrl: `${WEB_BASE_URL}/api/vapi/tools`,
    };

    const toolDefinition = createVapiToolDefinition(tool, vapiConfig);

    if (!existingTool) {
      const created = await client.tools.create(toolDefinition);
      console.log("Created tool:", {
        id: created.id,
        name: created.function?.name,
      });
      toolIds.push(created.id);
    } else {
      const updated = await client.tools.update(existingTool.id, {
        async: toolDefinition.async,
        function: toolDefinition.function,
        messages: toolDefinition.messages,
        server: toolDefinition.server,
      });
      console.log("Updated tool:", {
        id: updated.id,
        name: updated.function?.name,
      });
      toolIds.push(updated.id);
    }
  }

  return toolIds;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await dumpState(timestamp, "before");
  const toolIds = await updateTools();
  await updateAssistant(toolIds);
  await dumpState(timestamp, "after");
}

main().catch(console.error);
