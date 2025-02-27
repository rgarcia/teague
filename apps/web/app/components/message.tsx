import type { ChatRequestOptions, Message, UIMessage } from "ai";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useMemo, useState } from "react";

// import type { Vote } from "@/lib/db/schema";

// import { DocumentToolCall, DocumentToolResult } from "./document";
import {
  // ChevronDownIcon,
  // LoaderIcon,
  PencilEditIcon,
  SparklesIcon,
} from "./icons";
import { Markdown } from "./markdown";
import { MessageActions } from "./message-actions";
// import { PreviewAttachment } from "./preview-attachment";
// import { Weather } from "./weather";
import equal from "fast-deep-equal";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { MessageEditor } from "./message-editor";
import {
  NextEmailUI,
  ArchiveEmailUI,
  FilterSenderUI,
  AcceptInviteUI,
  UnsubscribeUI,
  CreateDraftReplyUI,
  UpdateDraftReplyUI,
  SendDraftUI,
  DeleteDraftUI,
} from "./ToolUIs";
// import { DocumentPreview } from "./document-preview";
// import { MessageReasoning } from "./message-reasoning";

const PurePreviewMessage = ({
  chatId,
  message,
  // vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
  previousMessage,
}: {
  chatId: string;
  message: UIMessage;
  // vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[])
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  previousMessage: UIMessage | undefined;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
            {
              "w-full": mode === "edit",
              "group-data-[role=user]/message:w-fit": mode !== "edit",
            }
          )}
        >
          {message.role === "assistant" &&
            previousMessage?.role !== "assistant" && (
              <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
                <div className="translate-y-px">
                  <SparklesIcon size={14} />
                </div>
              </div>
            )}
          {message.role === "assistant" &&
            previousMessage?.role === "assistant" && (
              <div className="size-8 flex items-center rounded-full justify-center shrink-0 ring-border bg-background">
                <div className="translate-y-px"></div>
              </div>
            )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {/* {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))} */}
              </div>
            )}

            {/* {message.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={message.reasoning}
              />
            )} */}

            {message.parts && message.parts.length > 0 && (
              <div className="flex flex-col gap-4">
                {message.parts.map((part, index) => {
                  if (part.type === "tool-invocation") {
                    const toolInvocation = part.toolInvocation;
                    const { toolName, toolCallId, state, args } =
                      toolInvocation;

                    if (state === "result") {
                      const { result } = toolInvocation;

                      return (
                        <div key={toolCallId || index}>
                          {toolName === "GetNextEmail" ? (
                            <NextEmailUI args={args} result={result} />
                          ) : toolName === "ArchiveEmail" ? (
                            <ArchiveEmailUI args={args} result={result} />
                          ) : toolName === "FilterSender" ? (
                            <FilterSenderUI args={args} result={result} />
                          ) : toolName === "AcceptInvite" ? (
                            <AcceptInviteUI args={args} result={result} />
                          ) : toolName === "Unsubscribe" ? (
                            <UnsubscribeUI args={args} result={result} />
                          ) : toolName === "CreateDraftReply" ? (
                            <CreateDraftReplyUI args={args} result={result} />
                          ) : toolName === "UpdateDraftReply" ? (
                            <UpdateDraftReplyUI args={args} result={result} />
                          ) : toolName === "SendDraft" ? (
                            <SendDraftUI args={args} result={result} />
                          ) : toolName === "DeleteDraft" ? (
                            <DeleteDraftUI args={args} result={result} />
                          ) : (
                            <pre className="text-sm">
                              {JSON.stringify({ toolName, result }, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={toolCallId || index}
                        className={cx({
                          skeleton: ["getWeather"].includes(toolName),
                        })}
                      >
                        {toolName === "GetNextEmail" ? (
                          <NextEmailUI args={args} />
                        ) : toolName === "ArchiveEmail" ? (
                          <ArchiveEmailUI args={args} />
                        ) : toolName === "FilterSender" ? (
                          <FilterSenderUI args={args} />
                        ) : toolName === "AcceptInvite" ? (
                          <AcceptInviteUI args={args} />
                        ) : toolName === "Unsubscribe" ? (
                          <UnsubscribeUI args={args} />
                        ) : toolName === "CreateDraftReply" ? (
                          <CreateDraftReplyUI args={args} />
                        ) : toolName === "UpdateDraftReply" ? (
                          <UpdateDraftReplyUI args={args} />
                        ) : toolName === "SendDraft" ? (
                          <SendDraftUI args={args} />
                        ) : toolName === "DeleteDraft" ? (
                          <DeleteDraftUI args={args} />
                        ) : (
                          <pre className="text-sm">
                            {JSON.stringify({ toolName, args }, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  } else if (part.type === "text") {
                    // Handle text parts within the same loop
                    return (
                      <div
                        key={index}
                        className={cn("flex flex-row gap-2 items-start")}
                      >
                        {index === 0 &&
                          message.role === "user" &&
                          !isReadonly && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                                  onClick={() => {
                                    setMode("edit");
                                  }}
                                >
                                  <PencilEditIcon />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit message</TooltipContent>
                            </Tooltip>
                          )}

                        <div
                          className={cn("flex flex-col gap-4", {
                            "bg-primary text-primary-foreground px-3 py-2 rounded-xl":
                              message.role === "user",
                          })}
                        >
                          <Markdown>{part.text}</Markdown>
                        </div>
                      </div>
                    );
                  } else if (part.type === "reasoning") {
                    // Handle reasoning parts if needed
                    return (
                      <div
                        key={index}
                        className="flex flex-row gap-2 items-start"
                      >
                        <div className="flex flex-col gap-4">
                          <Markdown>{part.reasoning}</Markdown>
                        </div>
                      </div>
                    );
                  }

                  // Default rendering for unknown part types
                  return (
                    <div
                      key={index}
                      className="flex flex-row gap-2 items-start"
                    >
                      <div className="flex flex-col gap-4">
                        <pre className="text-sm">
                          {JSON.stringify(
                            { todo: "unhandled part", part },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* no parts. This is typically a user message since the AI SDK convertToCoreMessages assumes user messages have `content` string */}
            {(!message.parts || message.parts.length === 0) &&
              message.content &&
              mode === "view" && (
                <div className="flex flex-row gap-2 items-start">
                  {message.role === "user" && !isReadonly && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                          onClick={() => {
                            setMode("edit");
                          }}
                        >
                          <PencilEditIcon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit message</TooltipContent>
                    </Tooltip>
                  )}

                  <div
                    className={cn("flex flex-col gap-4", {
                      "bg-primary text-primary-foreground px-3 py-2 rounded-xl":
                        message.role === "user",
                    })}
                  >
                    <Markdown>{message.content as string}</Markdown>
                  </div>
                </div>
              )}

            {message.content && mode === "edit" && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                // vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    // if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  }
);

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          "flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl",
          {
            "group-data-[role=user]/message:bg-muted": true,
          }
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
