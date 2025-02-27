import {
  ReasoningUIPart,
  SourceUIPart,
  TextUIPart,
  ToolInvocationUIPart,
  UIMessage,
} from "@ai-sdk/ui-utils";
import {
  CoreAssistantMessage,
  CoreToolMessage,
  ToolCallPart,
  ToolResultPart,
} from "ai";
import { clsx, type ClassValue } from "clsx";
import type { NewMessage } from "db";
import { Message as DBMessage } from "db";
import { createContext, useContext } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// generateUUID is a client-friendly version of randomUUID (avoids bundling crypto on the client)
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/*
 * sanitizeUIMessages is called when the user hits the stop button.
 * it removes any in-progress / incomplete tool calls
 */
export function sanitizeUIMessages(
  messages: Array<UIMessage>
): Array<UIMessage> {
  const messagesBySanitizedToolInvocations = messages.map((message) => {
    if (message.role !== "assistant") return message;

    const toolInvocationParts = message.parts
      ? message.parts.filter((part) => part.type === "tool-invocation")
      : [];
    const containsToolInvocations = toolInvocationParts.length > 0;
    if (!containsToolInvocations) return message;

    const toolResultIds: Array<string> = [];
    for (const toolInvocation of toolInvocationParts) {
      if (toolInvocation.toolInvocation.state === "result") {
        toolResultIds.push(toolInvocation.toolInvocation.toolCallId);
      }
    }

    const sanitizedToolInvocations = toolInvocationParts.filter(
      (toolInvocation) =>
        toolInvocation.toolInvocation.state === "result" ||
        toolResultIds.includes(toolInvocation.toolInvocation.toolCallId)
    );

    return {
      ...message,
      parts: message.parts?.filter(
        (part) =>
          part.type !== "tool-invocation" ||
          sanitizedToolInvocations.includes(part)
      ),
    };
  });

  return messagesBySanitizedToolInvocations.filter(
    (message) => message.parts && message.parts.length > 0
  );
}

export function getMostRecentUserMessage(
  messages: Array<UIMessage>
): UIMessage {
  const userMessages = messages.filter((message) => message.role === "user");
  if (userMessages.length === 0) {
    throw new Error("No user messages found");
  }
  return userMessages.at(-1)!;
}

// encode the assumptions we make about specific types UI messages
type UIMessageUser = UIMessage & {
  role: "user";
  content: string;
};
type UIMessageAssistant = UIMessage & {
  role: "assistant";
  parts: Array<
    TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart
  >;
};
type UIMessageTool = UIMessage & {
  role: "tool";
  parts: Array<ToolResultPart>;
};

export function convertToUIMessages(
  messages: Array<DBMessage>
): Array<UIMessage> {
  return messages.map((message) => {
    switch (message.role) {
      case "user":
        if (typeof message.content !== "string") {
          throw new Error(
            `User message content in DB must be a string: ${JSON.stringify(
              message.content
            )}`
          );
        }
        return {
          id: message.id,
          role: "user",
          parts: [{ type: "text", text: message.content }],
        } as UIMessageUser;
      case "assistant":
        return {
          id: message.id,
          role: "assistant",
          parts: message.parts,
        } as UIMessageAssistant;
      case "tool":
        return {
          id: message.id,
          role: "tool",
          parts: message.parts,
        } as UIMessageTool;
      default:
        throw new Error(
          `Unexpected message role in convertToUIMessages: ${JSON.stringify(
            message
          )}`
        );
    }
  });
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

// For assistant and tool messages we use parts[]
// For user messages we use content: string
type NewMessageForDB = NewMessage & {
  role: UIMessage["role"];
  content: "";
  parts: Array<
    TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart
  >;
};

/**
 * Sanitizes the response messages from the AI SDK generation for saving to the database and subsequent consumption by the UI.
 *
 * @param chatId - The chat id.
 * @param messages - The response messages to sanitize.
 * @returns Messages ready to be saved to the database.
 */
export function sanitizeResponseMessages({
  chatId,
  messages,
}: {
  chatId: string;
  messages: Array<ResponseMessage>;
}): Array<NewMessageForDB> {
  const now = new Date();
  const lifecycleTimesWithOrderPreserved = (index: number) => {
    return {
      createdAt: new Date(now.getTime() + index),
      updatedAt: new Date(now.getTime() + index),
    };
  };
  return messages
    .filter((message: ResponseMessage) => {
      // if message.content is an array, and every element is either type=text with empty text, or type tool-call, then return false
      // this is the assistant message output by the LLM when it selects to call a tool, and we don't care about it
      if (message.role === "assistant" && Array.isArray(message.content)) {
        return !message.content.every(
          (part) =>
            (part.type === "text" && part.text === "") ||
            part.type === "tool-call"
        );
      }
      return true;
    })
    .map((message, index): NewMessageForDB | null => {
      switch (message.role) {
        case "tool": {
          // only include finished tool invocations since once fed back into the API they'll be converted to core messages, and this conversion requires a tool result
          const parts = message.content.filter(
            (part: ToolResultPart) => part.result !== undefined
          );
          if (parts.length === 0) {
            return null;
          }
          return {
            chatId,
            role: "assistant",
            content: "",
            id: message.id,
            ...lifecycleTimesWithOrderPreserved(index),
            parts: parts.map((part: ToolResultPart): ToolInvocationUIPart => {
              // when a tool call is output by the LLM it generates a role: assistant, type: tool-call message
              // with no result but with an ID and the args to the tool call
              // find this message
              let args: any;
              for (const message of messages) {
                if (message.role !== "assistant") continue;
                if (!Array.isArray(message.content)) continue;
                const toolCalls: Array<ToolCallPart> = message.content.filter(
                  (part) => part.type === "tool-call"
                );
                const toolCall = toolCalls.find(
                  (toolCall) => toolCall.toolCallId === part.toolCallId
                );
                if (toolCall) {
                  args = toolCall.args;
                  break;
                }
              }
              if (!args) {
                console.error(
                  `Warning: no tool call found for tool call ${part.toolCallId}`
                );
              }
              return {
                type: "tool-invocation",
                toolInvocation: {
                  args,
                  result: part.result,
                  state: "result",
                  step: 0, // not sure what this is and how it's used
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                },
              };
            }),
          };
        }
        case "assistant":
          // consistently set set content to an array so that the frontend can just assume message content is an array for assistant and tool messages
          let parts: Array<
            TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart
          > = [];
          if (typeof message.content === "string") {
            parts = [{ type: "text", text: message.content }];
          } else if (Array.isArray(message.content)) {
            parts = message.content
              .filter((part) => {
                if (part.type === "text" && part.text === "") {
                  return false;
                } else if (part.type === "tool-call") {
                  return false; // only care about completed tool calls. Will examine this later when looking for args
                }
                return true;
              })
              .map((part) => {
                if (part.type === "text") {
                  return part as TextUIPart;
                } else if (part.type === "reasoning") {
                  return {
                    type: "reasoning",
                    details: [
                      {
                        type: "text",
                        text: part.text,
                        signature: part.signature,
                      },
                    ],
                  } as ReasoningUIPart;
                } else if (part.type === "redacted-reasoning") {
                  return {
                    type: "reasoning",
                    details: [{ type: "redacted", data: part.data }],
                  } as ReasoningUIPart;
                } else {
                  throw new Error(
                    `Unexpected part type in sanitizeResponseMessages: ${JSON.stringify(
                      part
                    )}`
                  );
                }
              });
            return {
              chatId,
              role: message.role,
              id: message.id,
              ...lifecycleTimesWithOrderPreserved(index),
              content: "",
              parts,
            };
          }
        default:
          throw new Error(
            `Unexpected message role in sanitizeResponseMessages: ${JSON.stringify(
              message
            )}`
          );
      }
    })
    .filter((message) => message !== null) as Array<NewMessageForDB>;
}

export function createContextFactory<ContextData>(options?: {
  defaultValue?: ContextData | null;
  errorMessage?: string;
}) {
  const opts = {
    defaultValue: null,
    errorMessage: "useContext must be used within a Provider",
    ...options,
  };

  const context = createContext<ContextData | null>(opts.defaultValue);

  function useContextFactory(): ContextData {
    const contextValue = useContext(context);
    if (contextValue === null) {
      throw new Error(opts.errorMessage);
    }
    return contextValue;
  }

  return [context.Provider, useContextFactory] as const;
}
