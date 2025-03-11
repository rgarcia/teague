import { google } from "@ai-sdk/google";
import { generateText, type CoreMessage } from "ai";
import type { ChatPromptClient } from "langfuse";
import { langfuse } from "langfuse-util";
import { z } from "zod";
import {
  formatDraftReply,
  gmailClientForToken,
  parseGmailEmail,
} from "./gmail";
import type { BaseToolConfig } from "./registry";

const updateDraftReplySchema = z.object({
  draftId: z.string().describe("The ID of the draft to update"),
  messageId: z.string().describe("The ID of the message being replied to"),
  updates: z.string().describe("Instructions for updating the draft"),
});

export type UpdateDraftReplyInput = z.infer<typeof updateDraftReplySchema>;
export type UpdateDraftReplyOutput = {
  draftId: string;
  body: string;
};

let updateDraftReplyPrompt: ChatPromptClient;

export const updateDraftReplyConfig: BaseToolConfig<
  typeof updateDraftReplySchema,
  UpdateDraftReplyOutput
> = {
  name: "UpdateDraftReply",
  description:
    "Update a draft reply using AI to modify the content based on instructions.",
  parameters: updateDraftReplySchema,
  vapiParameters: {
    type: "object",
    properties: {
      draftId: {
        type: "string",
        description: "The ID of the draft to update",
      },
      messageId: {
        type: "string",
        description: "The ID of the message being replied to",
      },
      updates: {
        type: "string",
        description: "Instructions for updating the draft",
      },
    },
    required: ["draftId", "messageId", "updates"],
  },
  execute: async ({ draftId, messageId, updates }, context) => {
    try {
      if (!context.googleToken) {
        throw new Error("Google token is required for this operation");
      }

      const gmail = gmailClientForToken(context.googleToken);

      // Get user's email address for parseGmailEmail
      const [profile, messageData] = await Promise.all([
        gmail.users.getProfile({
          userId: "me",
        }),
        gmail.users.messages.get({
          userId: "me",
          id: messageId,
        }),
      ]);
      const userEmail = profile.data.emailAddress;
      if (!userEmail) {
        throw new Error("Could not get user's email address");
      }

      const originalMessage = messageData.data;
      if (!originalMessage.payload || !originalMessage.payload.headers) {
        throw new Error("Original message has no headers");
      }
      const threadId = originalMessage.threadId;

      // Parse the email to get the formatted content
      const parsedEmail = await parseGmailEmail(
        messageData.data,
        gmail,
        userEmail
      );

      // Get the existing draft get current content
      const existingDraft = await gmail.users.drafts.get({
        userId: "me",
        id: draftId,
      });
      const currentBody = existingDraft.data?.message?.payload?.body?.data;
      if (!currentBody) {
        throw new Error("Could not find plain text body in existing draft");
      }
      const decodedBody = Buffer.from(currentBody, "base64").toString();

      // Initialize update draft prompt if not already done
      if (!updateDraftReplyPrompt) {
        updateDraftReplyPrompt = await langfuse.getPrompt(
          "create-draft-reply",
          undefined,
          {
            label: "production",
            type: "chat",
          }
        );
        if (updateDraftReplyPrompt.type !== "chat") {
          throw new Error("Update draft prompt is not a chat prompt");
        }
      }

      const compiledPrompt = updateDraftReplyPrompt.compile({
        email: parsedEmail.llmFormatted,
        currentDraft: `The current draft looks like this:\n<draft>\n${decodedBody}\n</draft>`,
        additionalDirections: `Here are the requested updates:\n<updates>\n${updates}\n</updates>`,
        userPreferences: `Please make my emails sound friendly. E.g., if you say "thanks" or "thank you" in the middle of an email, use an exclamation point.`,
        userFirstName: context.user.firstName ?? "",
      });
      const systemMessage = compiledPrompt.find((m) => m.role === "system");
      if (!systemMessage) {
        throw new Error("No system message found in prompt");
      }
      const otherMessages: CoreMessage[] = compiledPrompt
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      if (otherMessages.length === 0) {
        throw new Error("No user messages found in prompt");
      }

      // Generate the updated draft using AI
      const result = await generateText({
        // @ts-ignore type error here for whatever reason
        model: google("gemini-2.0-flash"),
        system: systemMessage.content,
        messages: otherMessages,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            langfusePrompt: updateDraftReplyPrompt.toJSON(),
            messageId,
          },
        },
      });

      const body = result.text;
      const rawMessage = formatDraftReply({
        originalMessage: messageData.data,
        body,
        userEmail,
      });
      const draft = await gmail.users.drafts.update({
        userId: "me",
        id: draftId,
        requestBody: {
          message: {
            raw: rawMessage,
            threadId,
          },
        },
      });
      return {
        draftId: draft.data.id!,
        body,
      };
    } catch (e) {
      console.error("Error updating draft reply", e);
      throw e;
    }
  },
  messages: [
    {
      type: "request-start" as const,
      content: "Updating draft reply...",
    },
    {
      type: "request-failed" as const,
      content: "Failed to update draft reply. Please try again.",
    },
    {
      type: "request-response-delayed" as const,
      content: "Still working on updating the draft reply...",
      timingMilliseconds: 10000,
    },
  ],
};
