import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createToolSet } from "./toolset.js";

const toolSet = await createToolSet({
  mcpServers: {
    gmail: {
      command: "bun",
      args: ["../../packages/tools/src/gmail.ts"],
      env: {
        ...process.env,
        LOG_LEVEL: "debug",
        TOKEN_JSON_PATH: process.cwd() + "/../../packages/auth/token.json",
      },
    },
  },
});

const { text: answer } = await generateText({
  model: openai("gpt-4o"),
  tools: toolSet.tools,
  maxSteps: 10,
  system: `You are a helpful assistant that can help people with managing their email. These people are busy and don't have time to read all their email.
  You can help them manage their email by searching for emails, summarizing them, and proposing quick actions like archiving or drafting and sending quick responses. When selecting a tool, include reasoning in your response.`,
  prompt: "What are the unread emails in my inbox that I can quickly address?",
  onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
    console.log("onStepFinish", {
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
    });
  },
});

console.log(`ANSWER: ${answer}`);
