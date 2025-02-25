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
import { ReactNode } from "react";

/**
 * Creates a simple tool UI component that takes a nullable result and args directly.
 */
function createSimpleToolUIComponent<TInput, TOutput>({
  runningMessage,
  completedMessage,
}: {
  runningMessage: string | ((args: TInput, result: TOutput | null) => string);
  completedMessage: string | ((args: TInput, result: TOutput | null) => string);
}) {
  // Return a React component that takes args and result as props
  return function SimpleToolUIComponent({
    args,
    result = null,
  }: {
    args: TInput;
    result?: TOutput | null;
  }): ReactNode {
    const isRunning = result === null;

    const getMessage = (
      message: string | ((args: TInput, result: TOutput | null) => string)
    ): string =>
      typeof message === "function" ? message(args, result) : message;

    return (
      <Badge
        variant="outline"
        className="flex items-center gap-2 p-2 max-w-fit"
      >
        {isRunning ? (
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
  };
}

// Individual tool UI components
export const NextEmailUI = createSimpleToolUIComponent<
  NextEmailInput,
  NextEmailOutput
>({
  runningMessage: (args) => `Getting next email: "${args.query}"`,
  completedMessage: (args) => `Got next email: "${args.query}"`,
});

export const ArchiveEmailUI = createSimpleToolUIComponent<
  ArchiveEmailInput,
  ArchiveEmailOutput
>({
  runningMessage: "Archiving email",
  completedMessage: "Archived email",
});

export const FilterSenderUI = createSimpleToolUIComponent<
  FilterSenderInput,
  FilterSenderOutput
>({
  runningMessage: "Filtering sender from inbox",
  completedMessage: "Filtered sender from inbox",
});

export const AcceptInviteUI = createSimpleToolUIComponent<
  AcceptInviteInput,
  AcceptInviteOutput
>({
  runningMessage: "Accepting calendar invite",
  completedMessage: "Accepted calendar invite",
});

export const UnsubscribeUI = createSimpleToolUIComponent<
  UnsubscribeInput,
  UnsubscribeOutput
>({
  runningMessage: "Unsubscribing from sender",
  completedMessage: "Unsubscribed from sender",
});

export const CreateDraftReplyUI = createSimpleToolUIComponent<
  CreateDraftReplyInput,
  CreateDraftReplyOutput
>({
  runningMessage: "Creating draft reply...",
  completedMessage: (args, result) =>
    `Created draft reply: ${result?.body.substring(0, 50)}...`,
});

export const UpdateDraftReplyUI = createSimpleToolUIComponent<
  UpdateDraftReplyInput,
  UpdateDraftReplyOutput
>({
  runningMessage: "Updating draft reply...",
  completedMessage: (args, result) =>
    `Updated draft reply: ${result?.body.substring(0, 50)}...`,
});

export const SendDraftUI = createSimpleToolUIComponent<
  SendDraftInput,
  SendDraftOutput
>({
  runningMessage: "Sending draft...",
  completedMessage: "Sent draft successfully",
});

export const DeleteDraftUI = createSimpleToolUIComponent<
  DeleteDraftInput,
  DeleteDraftOutput
>({
  runningMessage: "Deleting draft...",
  completedMessage: "Deleted draft successfully",
});
