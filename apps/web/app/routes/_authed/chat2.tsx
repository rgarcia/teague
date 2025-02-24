import { createFileRoute } from "@tanstack/react-router";
import { generateUUID } from "@/lib/utils";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { Chat } from "~/components/chat";
import { SidebarProvider } from "~/components/ui/sidebar";

export const Route = createFileRoute("/_authed/chat2")({
  loader: async () => {
    return {
      id: generateUUID(),
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useLoaderData();

  return (
    <>
      <SidebarProvider>
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          selectedChatModel={DEFAULT_CHAT_MODEL}
          // selectedVisibilityType="private"
          isReadonly={false}
        />
        {/* <DataStreamHandler id={id} /> */}
      </SidebarProvider>
    </>
  );
}
