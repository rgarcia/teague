import { createFileRoute } from "@tanstack/react-router";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Thread } from "@/components/assistant-ui/thread";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { NextEmailInput, NextEmailOutput } from "~/tools/next-email";

export const Route = createFileRoute("/_authed/chat")({
  component: ChatComponent,
});

export const NextEmailToolUI = makeAssistantToolUI<
  NextEmailInput,
  NextEmailOutput
>({
  toolName: "GetNextEmail",
  render: ({ args, status }) => {
    return <p>GetNextEmail({args.query})</p>;
  },
});

function ChatComponent() {
  const runtime = useChatRuntime({
    api: "/api/chat",
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NextEmailToolUI />
      <div className="grid h-dvh grid-cols-[200px_1fr] gap-x-2 px-4 py-4">
        <ThreadList />
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
