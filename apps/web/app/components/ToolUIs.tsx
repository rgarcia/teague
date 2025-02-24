import { makeAssistantToolUI } from "@assistant-ui/react";
import { NextEmailInput, NextEmailOutput } from "~/tools/next-email";
import { ArchiveEmailInput, ArchiveEmailOutput } from "~/tools/archive-email";
import { FilterSenderInput, FilterSenderOutput } from "~/tools/filter-sender";
import { AcceptInviteInput, AcceptInviteOutput } from "~/tools/accept-invite";
import { UnsubscribeInput, UnsubscribeOutput } from "~/tools/unsubscribe";
import {
  CreateDraftReplyInput,
  CreateDraftReplyOutput,
} from "~/tools/create-draft-reply";
import {
  UpdateDraftReplyInput,
  UpdateDraftReplyOutput,
} from "~/tools/update-draft-reply";
import { SendDraftInput, SendDraftOutput } from "~/tools/send-draft";
import { DeleteDraftInput, DeleteDraftOutput } from "~/tools/delete-draft";
import { CheckIcon, LoaderIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

const CreateDraftReplyToolUI = createSimpleToolUI<
  CreateDraftReplyInput,
  CreateDraftReplyOutput
>({
  toolName: "CreateDraftReply",
  runningMessage: "Creating draft reply...",
  completedMessage: (args, result) =>
    `Created draft reply: ${result?.body.substring(0, 50)}...`,
});

const UpdateDraftReplyToolUI = createSimpleToolUI<
  UpdateDraftReplyInput,
  UpdateDraftReplyOutput
>({
  toolName: "UpdateDraftReply",
  runningMessage: "Updating draft reply...",
  completedMessage: (args, result) =>
    `Updated draft reply: ${result?.body.substring(0, 50)}...`,
});

const SendDraftToolUI = createSimpleToolUI<SendDraftInput, SendDraftOutput>({
  toolName: "SendDraft",
  runningMessage: "Sending draft...",
  completedMessage: "Sent draft successfully",
});

const DeleteDraftToolUI = createSimpleToolUI<
  DeleteDraftInput,
  DeleteDraftOutput
>({
  toolName: "DeleteDraft",
  runningMessage: "Deleting draft...",
  completedMessage: "Deleted draft successfully",
});

export function ToolUIs() {
  return (
    <>
      <NextEmailToolUI />
      <ArchiveEmailToolUI />
      <FilterSenderToolUI />
      <AcceptInviteToolUI />
      <UnsubscribeToolUI />
      <CreateDraftReplyToolUI />
      <UpdateDraftReplyToolUI />
      <SendDraftToolUI />
      <DeleteDraftToolUI />
    </>
  );
}
