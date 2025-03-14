import { createId } from "@paralleldrive/cuid2";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { createChatWithMessage } from "~/utils/chats";
import { ChatHeader } from "~/components/chat-header";
import { DEFAULT_CHAT_MODEL } from "~/lib/ai/models";
import { Messages } from "~/components/messages";
import { MultimodalInput } from "~/components/multimodal-input";

export const Route = createFileRoute("/_authed/_chat/chat/")({
  loader: async ({ context }) => {
    return {
      context,
      id: createId(),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id, context } = Route.useLoaderData();
  const router = useRouter();
  const [input, setInput] = useState("");
  const handleSubmit = useCallback(async () => {
    const formData = new FormData();
    let initialMessage = localStorage.getItem(`chat_${id}_initialMessage`);
    if (!initialMessage) {
      initialMessage = input;
      localStorage.setItem(`chat_${id}_initialMessage`, input);
    }
    formData.append("initialMessage", initialMessage);
    formData.append("userId", context.user!.id);
    formData.append("chatId", id);
    await createChatWithMessage({ data: formData });
    router.navigate({ to: "/chat/$id", params: { id } });
  }, [input, context.user!.id, id, router]);

  const append = useCallback(
    async (message: { role: string; content: string }) => {
      localStorage.setItem(`chat_${id}_initialMessage`, message.content);
      handleSubmit();
      return null;
    },
    [handleSubmit, id]
  );

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={DEFAULT_CHAT_MODEL}
          isReadonly={false}
        />

        <Messages
          chatId={id}
          isLoading={false}
          // votes={votes}
          messages={[]}
          setMessages={() => {}}
          reload={() => Promise.resolve(null)}
          isReadonly={false}
          // isArtifactVisible={isArtifactVisible}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          <MultimodalInput
            chatId={id}
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={false}
            stop={() => {}}
            attachments={[]}
            setAttachments={() => {}}
            messages={[]}
            setMessages={() => {}}
            append={append}
          />
        </form>
      </div>

      {/* <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        // votes={votes}
        isReadonly={isReadonly}
      /> */}
    </>
  );
}
