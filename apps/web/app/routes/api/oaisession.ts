import { createAPIFileRoute } from "@tanstack/start/api";
import type { Realtime } from "openai/resources/beta/realtime/realtime";

export const APIRoute = createAPIFileRoute("/api/oaisession")({
  GET: async ({ request, params }) => {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        // https://platform.openai.com/docs/guides/text-to-speech
        // Supported values are: 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', and 'verse'."
        voice: "alloy",
        modalities: ["audio", "text"],
      } as Realtime.SessionCreateParams),
    });

    return new Response(r.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
});
