import { SignIn } from "@clerk/tanstack-start";
import { createFileRoute } from "@tanstack/react-router";
import { dark } from "@clerk/themes";
import { useTheme } from "~/components/theme-provider";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const theme = useTheme();
  return (
    <div className="flex items-center justify-center h-screen">
      <SignIn
        appearance={{
          baseTheme: theme.resolved === "dark" ? dark : undefined,
        }}
        routing="hash"
      />
    </div>
  );
}
