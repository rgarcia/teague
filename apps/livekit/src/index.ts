import type { JobProcess } from "@livekit/agents";
import {
  AutoSubscribe,
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  pipeline,
} from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { langfuse } from "langfuse-util";
import { fileURLToPath } from "node:url";
import toolRegistry from "tools/all-tools";
import {
  createLivekitToolDefition,
  requestContextFromAttributes,
} from "tools/livekit-adapter";

const registeredTools = toolRegistry.getAllTools();

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;
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

    const initialContext = new llm.ChatContext().append({
      role: llm.ChatRole.SYSTEM,
      text: systemPromptText,
    });

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    const participant = await ctx.waitForParticipant();
    const toolDefs = Object.fromEntries(
      registeredTools.map((tool) => {
        return createLivekitToolDefition(
          tool,
          requestContextFromAttributes(participant.attributes)
        );
      })
    );
    const fncCtx: llm.FunctionContext = toolDefs;

    const agent = new pipeline.VoicePipelineAgent(
      vad,
      new deepgram.STT(),
      new openai.LLM(),
      //      new openai.TTS(),
      new elevenlabs.TTS(),
      {
        chatCtx: initialContext,
        fncCtx,
        turnDetector: new livekit.turnDetector.EOUModel(),
      }
    );
    agent.start(ctx.room, participant);
    await agent.say("Hey, how can I help you today", true);
  },
});

console.log("starting agent", import.meta.url, fileURLToPath(import.meta.url));
cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
