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
    const initialContext = new llm.ChatContext().append({
      role: llm.ChatRole.SYSTEM,
      text:
        "You are a voice assistant created by LiveKit. Your interface with users will be voice. " +
        "You should use short and concise responses, and avoiding usage of unpronounceable " +
        "punctuation.",
    });

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    console.log("waiting for participant");
    const participant = await ctx.waitForParticipant();
    console.log(
      "DEBUG: participant attributes, metadata:",
      participant.attributes,
      participant.metadata
    );
    console.log(`starting assistant example agent for ${participant.identity}`);
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
