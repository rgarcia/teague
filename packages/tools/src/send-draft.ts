import { z } from "zod";
import { gmailClientForToken } from "./gmail";
import type { BaseToolConfig } from "./registry";

const sendDraftSchema = z.object({
  draftId: z.string().describe("The ID of the draft to send"),
});

export type SendDraftInput = z.infer<typeof sendDraftSchema>;
export type SendDraftOutput = {
  messageId: string;
};

export const sendDraftConfig: BaseToolConfig<
  typeof sendDraftSchema,
  SendDraftOutput
> = {
  name: "SendDraft",
  description: "Send a draft email.",
  parameters: sendDraftSchema,
  vapiParameters: {
    type: "object",
    properties: {
      draftId: {
        type: "string",
        description: "The ID of the draft to send",
      },
    },
    required: ["draftId"],
  },
  execute: async ({ draftId }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }

    const gmail = gmailClientForToken(context.googleToken);
    const sentMessage = await gmail.users.drafts.send({
      userId: "me",
      requestBody: { id: draftId },
    });

    return {
      messageId: sentMessage.data.id!,
    };
  },
  messages: [
    {
      type: "request-start" as const,
      content: "Sending draft...",
    },
    {
      type: "request-failed" as const,
      content: "Failed to send draft. Please try again.",
    },
    {
      type: "request-response-delayed" as const,
      content: "Still working on sending the draft...",
      timingMilliseconds: 10000,
    },
  ],
};
