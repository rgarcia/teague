import { google } from "@ai-sdk/google";
import { generateText, type CoreMessage } from "ai";
import type { ChatPromptClient } from "langfuse";
import { langfuse } from "langfuse-util";
import { z } from "zod";
import {
  createReplyAttribution,
  formatDraftReply,
  gmailClientForToken,
  parseGmailEmail,
} from "./gmail";
import type { BaseToolConfig } from "./registry";

const createDraftReplySchema = z.object({
  messageId: z.string().describe("The ID of the message to reply to"),
  guidance: z
    .string()
    .describe(
      "Any guidance the user provided when directing you to create a draft reply"
    ),
});

export type CreateDraftReplyInput = z.infer<typeof createDraftReplySchema>;
export type CreateDraftReplyOutput = {
  draftId: string;
  body: string;
};

let draftReplyPrompt: ChatPromptClient;

export const createDraftReplyConfig: BaseToolConfig<
  typeof createDraftReplySchema,
  CreateDraftReplyOutput
> = {
  name: "CreateDraftReply",
  description:
    "Create a draft reply to an email using AI to compose the response.",
  parameters: createDraftReplySchema,
  vapiParameters: {
    type: "object",
    properties: {
      messageId: {
        type: "string",
        description: "The ID of the message to reply to",
      },
      guidance: {
        type: "string",
        description:
          "Any guidance the user provided when directing you to create a draft reply",
      },
    },
    required: ["messageId", "guidance"],
  },
  execute: async ({ messageId, guidance }, context) => {
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

      // Get the system message and other messages from the prompt
      if (!draftReplyPrompt) {
        draftReplyPrompt = await langfuse.getPrompt(
          "create-draft-reply",
          undefined,
          {
            label: "production",
            type: "chat",
          }
        );
        if (draftReplyPrompt.type !== "chat") {
          throw new Error("Draft reply prompt is not a chat prompt");
        }
      }
      const compiledPrompt = draftReplyPrompt.compile({
        email: parsedEmail.llmFormatted,
        currentDraft: "",
        additionalDirections: guidance,
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
      const result = await generateText({
        // @ts-ignore type error here for whatever reason
        model: google("gemini-2.0-flash"),
        system: systemMessage.content,
        messages: otherMessages,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            langfusePrompt: draftReplyPrompt.toJSON(),
            messageId,
          },
        },
      });
      const body = result.text;

      // Generate draft reply content with attribution line
      const replyAttribution = await createReplyAttribution({
        originalMessage: originalMessage,
      });

      // Append the attribution line after the AI-generated content
      const fullReplyBody = `${body}\n\n${replyAttribution}`;

      // Format the draft reply
      const formattedReply = formatDraftReply({
        originalMessage,
        body: fullReplyBody,
        userEmail,
      });

      // Create the draft in gmail
      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            threadId,
            raw: Buffer.from(formattedReply)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_"),
          },
        },
      });

      // to keep the return of the LLM tool concise, only include the text result from the llm (i.e. body)
      // do not include the attribution + quote from the original message
      return {
        draftId: draft.data.id!,
        body,
      };
    } catch (e) {
      console.error("Error creating draft reply", e);
      throw e;
    }
  },
  messages: [
    {
      type: "request-start" as const,
      content: "Creating a draft reply...",
    },
    {
      type: "request-failed" as const,
      content: "Failed to create draft reply. Please try again.",
    },
    {
      type: "request-response-delayed" as const,
      content: "Still working on creating the draft reply...",
      timingMilliseconds: 10000,
    },
  ],
};
