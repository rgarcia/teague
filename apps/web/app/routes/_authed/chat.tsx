import { createFileRoute } from "@tanstack/react-router";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
// import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { NextEmailInput, NextEmailOutput } from "~/tools/next-email";
import { ArchiveEmailInput, ArchiveEmailOutput } from "~/tools/archive-email";
import { FilterSenderInput, FilterSenderOutput } from "~/tools/filter-sender";
import { AcceptInviteInput, AcceptInviteOutput } from "~/tools/accept-invite";
import { UnsubscribeInput, UnsubscribeOutput } from "~/tools/unsubscribe";
import { CheckIcon, LoaderIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SignedIn } from "@clerk/tanstack-start";

export const Route = createFileRoute("/_authed/chat")({
  component: ChatComponent,
});

// Helper function to create tool UIs with less boilerplate
function createSimpleToolUI<TInput, TOutput>({
  toolName,
  runningMessage,
  completedMessage,
}: {
  toolName: string;
  runningMessage:
    | string
    | ((args: TInput, result: TOutput | undefined) => string);
  completedMessage:
    | string
    | ((args: TInput, result: TOutput | undefined) => string);
}) {
  return makeAssistantToolUI<TInput, TOutput>({
    toolName,
    render: ({ args, status, result }) => {
      const getMessage = (
        message:
          | string
          | ((args: TInput, result: TOutput | undefined) => string)
      ): string =>
        typeof message === "function" ? message(args, result) : message;

      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 p-2 max-w-fit"
        >
          {status.type === "running" ? (
            <>
              <LoaderIcon size={16} className="animate-spin" />
              <p>{getMessage(runningMessage)}</p>
            </>
          ) : (
            <>
              <CheckIcon color="green" size={16} />
              <p>{getMessage(completedMessage)}</p>
            </>
          )}
        </Badge>
      );
    },
  });
}

// Tool UI definitions using the helper
const NextEmailToolUI = createSimpleToolUI<NextEmailInput, NextEmailOutput>({
  toolName: "GetNextEmail",
  runningMessage: (args) => `Getting next email: "${args.query}"`,
  completedMessage: (args) => `Got next email: "${args.query}"`,
});

const ArchiveEmailToolUI = createSimpleToolUI<
  ArchiveEmailInput,
  ArchiveEmailOutput
>({
  toolName: "ArchiveEmail",
  runningMessage: "Archiving email",
  completedMessage: "Archived email",
});

const FilterSenderToolUI = createSimpleToolUI<
  FilterSenderInput,
  FilterSenderOutput
>({
  toolName: "FilterSender",
  runningMessage: "Filtering sender from inbox",
  completedMessage: "Filtered sender from inbox",
});

const AcceptInviteToolUI = createSimpleToolUI<
  AcceptInviteInput,
  AcceptInviteOutput
>({
  toolName: "AcceptInvite",
  runningMessage: "Accepting calendar invite",
  completedMessage: "Accepted calendar invite",
});

const UnsubscribeToolUI = createSimpleToolUI<
  UnsubscribeInput,
  UnsubscribeOutput
>({
  toolName: "Unsubscribe",
  runningMessage: "Unsubscribing from sender",
  completedMessage: "Unsubscribed from sender",
});

function ChatComponent() {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <SignedIn>
      {/* <div className="grid h-dvh grid-cols-[200px_1fr] gap-x-2 px-4 py-72"> */}
      {/* <ThreadList /> */}
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="h-dvh flex flex-col p-4">
          <div className="flex gap-2 mb-4">
            <NextEmailToolUI />
            <ArchiveEmailToolUI />
            <FilterSenderToolUI />
            <AcceptInviteToolUI />
            <UnsubscribeToolUI />
          </div>
          <div className="flex-1 overflow-auto">
            <Thread />
          </div>
        </div>
      </AssistantRuntimeProvider>
    </SignedIn>
  );
}
