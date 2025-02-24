import { createFileRoute } from "@tanstack/react-router";
import { generateUUID } from "@/lib/utils";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { Chat } from "~/components/chat";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { useClerk } from "@clerk/tanstack-start";
import { AppSidebar } from "~/components/app-sidebar";

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
  const { user } = useClerk();

  return (
    <>
      <SidebarProvider defaultOpen={false /* todo read sidebar_state cookie */}>
        <AppSidebar user={user ?? undefined} />
        <SidebarInset>
          <Chat
            key={id}
            id={id}
            initialMessages={[]}
            selectedChatModel={DEFAULT_CHAT_MODEL}
            // selectedVisibilityType="private"
            isReadonly={false}
          />
        </SidebarInset>
        {/* <DataStreamHandler id={id} /> */}
      </SidebarProvider>
    </>
  );
}
