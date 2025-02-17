import { z } from "zod";
import { archiveEmail } from "~/utils/gmail.serverfns";
import type { BaseToolConfig } from "~/utils/tools/registry";

const archiveEmailSchema = z.object({
  messageId: z.string().describe("The ID of the message to archive"),
});

type ArchiveEmailOutput = { success: boolean };

export const archiveEmailConfig: BaseToolConfig<
  typeof archiveEmailSchema,
  ArchiveEmailOutput
> = {
  name: "ArchiveEmail",
  description: "Archive a specific email from the user's inbox.",
  parameters: archiveEmailSchema,
  vapiParameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The ID of the message to archive",
      },
    },
    required: ["messageId"],
  },
  execute: async ({ messageId }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }

    await archiveEmail({
      data: {
        googleToken: context.googleToken,
        messageId,
      },
    });

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
        "I couldn't archive the email right now, please try again later.",
    },
    {
      type: "request-response-delayed" as const,
      content:
        "I'm having some trouble archiving this email right now--let's try again later.",
      timingMilliseconds: 10000,
    },
  ],
};
