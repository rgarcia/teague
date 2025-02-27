import {
  createFileRoute,
  ErrorComponent,
  notFound,
} from "@tanstack/react-router";
import { fetchChatServer } from "../../../utils/chats";
import { Message as DBMessage } from "db";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { NotFound } from "~/components/NotFound";
import { fetchMessagesByChatId } from "~/utils/messages";
import { Chat } from "~/components/chat";
import { DEFAULT_CHAT_MODEL } from "~/lib/ai/models";
import { convertToUIMessages } from "~/lib/utils";

function ChatErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />;
}
export const Route = createFileRoute("/_authed/_chat/chat/$id")({
  beforeLoad: ({ params }) => {
    // Reject requests for file extensions like .js.map
    if (params.id.includes(".")) {
      throw new Error("Invalid chat ID");
    }
  },
  loader: async ({ params: { id }, context }) => {
    const { user } = context;
    const chat = await fetchChatServer({ data: id });
    if (!chat) {
      throw notFound();
    }
    if (chat.visibility === "private" && !user) {
      throw notFound();
    }
    if (user?.id !== chat.userId) {
      throw notFound();
    }
    const messages = (await fetchMessagesByChatId({
      data: id,
    })) as DBMessage[];
    return {
      chat,
      messages,
    };
  },
  component: RouteComponent,
  errorComponent: ChatErrorComponent,
  notFoundComponent: () => {
    return <NotFound>Chat not found</NotFound>;
  },
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { messages } = Route.useLoaderData();
  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={convertToUIMessages(messages)}
        selectedChatModel={DEFAULT_CHAT_MODEL}
        // selectedVisibilityType="private"
        isReadonly={false}
      />
    </>
  );
}
