import { AppSidebar } from "~/components/app-sidebar";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { useClerk } from "@clerk/tanstack-start";

export const Route = createFileRoute("/_authed/_chat")({
  component: ChatLayout,
});

function ChatLayout() {
  const { user } = useClerk();
  return (
    <>
      <SidebarProvider defaultOpen={false /* todo read sidebar_state cookie */}>
        <AppSidebar user={user ?? undefined} />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
        {/* <DataStreamHandler id={id} /> */}
      </SidebarProvider>
    </>
  );
}
