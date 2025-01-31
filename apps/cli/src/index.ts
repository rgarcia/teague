import { openai } from "@ai-sdk/openai";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { generateText, type CoreMessage } from "ai";
import { ChatPromptClient, Langfuse } from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";
import prompts from "prompts";
import { createToolSet } from "./toolset.js";

const requiredEnvVars = [
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_BASE_URL",
];
for (const requiredEnvVar of requiredEnvVars) {
  if (!process.env[requiredEnvVar]) {
    throw new Error(`${requiredEnvVar} is not set`);
  }
}

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

async function main() {
  const initialInteraction: ChatPromptClient = await langfuse.getPrompt(
    "initial-interaction",
    undefined,
    { type: "chat" }
  );
  const prompt = initialInteraction.compile({});
  if (prompt.length !== 2) {
    throw new Error("expected a chat prompt with two messages");
  } else if (prompt[0].role !== "system") {
    throw new Error("expected a system message as the first message");
  } else if (prompt[1].role !== "user") {
    throw new Error("expected a user message as the second message");
  }

  const toolSet = await createToolSet({
    mcpServers: {
      gmail: {
        command: "bun",
        args: ["../../packages/tools/src/gmail.ts"],
        env: {
          ...process.env,
          LOG_LEVEL: "info",
          TOKEN_JSON_PATH: process.cwd() + "/../../packages/auth/token.json",
        },
      },
    },
  });

  let messages: CoreMessage[] = [
    {
      role: "user",
      content: prompt[1].content,
    },
  ];
  while (true) {
    let step = 1;
    const llmres = await generateText({
      model: openai("gpt-4o"),
      tools: toolSet.tools,
      maxSteps: 10,
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          langfusePrompt: initialInteraction.toJSON(),
        },
      },
      system: prompt[0].content,
      messages,
      onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
        console.log(`<-- step ${step} -->`);
        if (text !== "") {
          console.log(text);
        }
        if (toolCalls.length > 0) {
          console.log("tool calls:");
          for (const [i, toolCall] of toolCalls.entries()) {
            console.log(
              `${i + 1}. ${toolCall.toolName}(${JSON.stringify(
                toolCall.args
              )}):`
            );
            // @ts-ignore the types are wrong
            console.log(toolResults[i].result);
          }
        }
        step++;
      },
    });
    for (const message of llmres.response.messages) {
      switch (message.role) {
        case "assistant":
          messages.push(message);
          break;
        case "tool":
          messages.push(message);
          break;
        default:
          throw new Error(`unknown message role: ${message}`);
      }
    }
    let proceed = false;
    switch (llmres.finishReason) {
      case "tool-calls":
        throw new Error(
          "max steps reached and still making tool calls... something's wrong"
        );
      case "stop":
        // use the prompts library to ask the user for new input, add it to the message
        const newInput = await prompts({
          type: "text",
          name: "input",
          message: "new input for the assistant",
        });
        if (newInput.input !== "") {
          messages.push({
            role: "user",
            content: newInput.input,
          });
          proceed = true;
        } else {
          proceed = false;
          break;
        }
    }
    if (!proceed) {
      break;
    }
  }
  await sdk.shutdown();
}

main().catch(console.error);
