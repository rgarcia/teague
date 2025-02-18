import { openai } from "@ai-sdk/openai";
import { createAPIFileRoute } from "@tanstack/start/api";
import { streamText } from "ai";

export const APIRoute = createAPIFileRoute("/api/chat")({
  POST: async ({ request, params }) => {
    const { messages } = await request.json();
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages,
    });
    return result.toDataStreamResponse();
  },
});
