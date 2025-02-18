import { VapiClient } from "@vapi-ai/server-sdk";
import { mkdirSync, writeFileSync } from "fs";
import { Langfuse } from "langfuse";
import path from "path";
import { acceptInviteConfig } from "~/tools/accept-invite";
import { archiveEmailConfig } from "~/tools/archive-email";
import { filterSenderConfig } from "~/tools/filter-sender";
import { nextEmailConfig } from "~/tools/next-email";
import { unsubscribeConfig } from "~/tools/unsubscribe";
import { ToolRegistryManager } from "~/utils/tools/registry";
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

// when dev'ing locally. TODO: make a separate assistant + tools for this
// const WEB_BASE_URL = "https://raf--cannon.ngrok.app";
const WEB_BASE_URL = "https://prod--web.raf.xyz";

// Create and populate the registry
// Add more tools here as they are created
const registry = new ToolRegistryManager();
registry.registerTool(acceptInviteConfig);
registry.registerTool(archiveEmailConfig);
registry.registerTool(filterSenderConfig);
registry.registerTool(nextEmailConfig);
registry.registerTool(unsubscribeConfig);

async function dumpState(timestamp: string, prefix: string) {
  const tools = await client.tools.list();
  const assistants = await client.assistants.list();
  const teague = assistants.find((assistant) => assistant.name === "Teague");

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
    JSON.stringify(teague, null, 2)
  );
}

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
    //firstMessageMode: "assistant-speaks-first-with-model-generated-message",
    firstMessage: "Let's go through  your inbox.",
    voicemailMessage: "Hey this is Ava, can you call me back when you're free?",
    endCallMessage: "I think that's all for now, good bye!",
    transcriber: {
      keywords: ["inbox", "email", "cannon"],
      provider: "deepgram",
      language: "en-US",
      model: "nova-2-general",
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

  const toolIds: string[] = [];
  const registeredTools = registry.getAllTools();

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
