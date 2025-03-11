import { z } from "zod";
import { archiveEmail, unsubscribeEmail } from "./gmail";
import type { BaseToolConfig } from "./registry";

const unsubscribeSchema = z.object({
  messageId: z.string().describe("The ID of the message to unsubscribe from"),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

export type UnsubscribeOutput = { success: boolean };

export const unsubscribeConfig: BaseToolConfig<
  typeof unsubscribeSchema,
  UnsubscribeOutput
> = {
  name: "Unsubscribe",
  description:
    "Unsubscribe from a mailing list using the List-Unsubscribe header.",
  parameters: unsubscribeSchema,
  vapiParameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The ID of the message to unsubscribe from",
      },
    },
    required: ["messageId"],
  },
  execute: async ({ messageId }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }
    console.log("DEBUG: unsubscribing from", messageId, "first archiving");
    // fire and forget both of these things for max speed
    archiveEmail({
      googleToken: context.googleToken,
      messageId,
    });
    console.log("DEBUG: unsubscribing from", messageId, "second unsubscribing");
    unsubscribeEmail({
      googleToken: context.googleToken,
      messageId,
    });
    console.log("DEBUG: returning success");
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
        "I couldn't unsubscribe from this email right now, please try again later.",
    },
    {
      type: "request-response-delayed" as const,
      content:
        "I'm having some trouble unsubscribing right now--let's try again later.",
      timingMilliseconds: 10000,
    },
  ],
};
