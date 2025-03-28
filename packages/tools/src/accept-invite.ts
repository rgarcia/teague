import { z } from "zod";
import { acceptInvite } from "./gcal";
import { archiveEmail } from "./gmail";
import type { BaseToolConfig } from "./registry";

const acceptInviteSchema = z.object({
  messageId: z.string().describe("The ID of the message containing the invite"),
  eventId: z.string().describe("The ID of the event to accept"),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export type AcceptInviteOutput = { success: boolean };

export const acceptInviteConfig: BaseToolConfig<
  typeof acceptInviteSchema,
  AcceptInviteOutput
> = {
  name: "AcceptInvite",
  description: "Accept an invite to a calendar event.",
  parameters: acceptInviteSchema,
  vapiParameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The ID of the message containing the invite",
      },
      eventId: {
        type: "string",
        description: "The ID of the event to accept",
      },
    },
    required: ["messageId", "eventId"],
  },
  execute: async ({ messageId, eventId }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }
    // fire and forget for speed
    Promise.all([
      archiveEmail({
        googleToken: context.googleToken,
        messageId,
      }),
      acceptInvite({
        googleToken: context.googleToken,
        eventId,
      }),
    ]);
    return { success: true };
  },
  messages: [
    {
      type: "request-start" as const,
      content: "",
    },
    {
      type: "request-failed" as const,
      content:
        "I couldn't accept the invite right now, please try again later.",
    },
    {
      type: "request-response-delayed" as const,
      content:
        "I'm having some trouble accepting this invite right now--let's try again later.",
      timingMilliseconds: 10000,
    },
  ],
};
