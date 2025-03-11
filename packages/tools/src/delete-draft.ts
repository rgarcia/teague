import { z } from "zod";
import { gmailClientForToken } from "./gmail";
import type { BaseToolConfig } from "./registry";

const deleteDraftSchema = z.object({
  draftId: z.string().describe("The ID of the draft to delete"),
});

export type DeleteDraftInput = z.infer<typeof deleteDraftSchema>;
export type DeleteDraftOutput = {
  success: boolean;
};

export const deleteDraftConfig: BaseToolConfig<
  typeof deleteDraftSchema,
  DeleteDraftOutput
> = {
  name: "DeleteDraft",
  description: "Delete a draft email.",
  parameters: deleteDraftSchema,
  vapiParameters: {
    type: "object",
    properties: {
      draftId: {
        type: "string",
        description: "The ID of the draft to delete",
      },
    },
    required: ["draftId"],
  },
  execute: async ({ draftId }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }

    const gmail = gmailClientForToken(context.googleToken);
    await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });

    return {
      success: true,
    };
  },
  messages: [
    {
      type: "request-start" as const,
      content: "Deleting draft...",
    },
    {
      type: "request-failed" as const,
      content: "Failed to delete draft. Please try again.",
    },
    {
      type: "request-response-delayed" as const,
      content: "Still working on deleting the draft...",
      timingMilliseconds: 10000,
    },
  ],
};
