import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { langfuse } from "langfuse-util";
import { weatherTool } from "../tools";

const systemPrompt = await langfuse.getPrompt("system-prompt", undefined, {
  label: "production",
  type: "chat",
});
if (systemPrompt.type !== "chat") {
  throw new Error("System prompt is not a chat prompt");
}
const systemPromptText = systemPrompt
  .compile()
  .find((p) => p.role === "system")?.content;
if (!systemPromptText) {
  throw new Error("Could not find system prompt");
}

export const blitzAgent = new Agent({
  name: "Blitz",
  instructions: systemPromptText,
  model: openai("gpt-4o"),
  tools: { weatherTool },
});
