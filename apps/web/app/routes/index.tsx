import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/tanstack-start";
import { useTheme } from "~/components/theme-provider";
import { dark } from "@clerk/themes";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const theme = useTheme();
  return (
    <div className="p-2">
      <div className="p-2 flex gap-2 text-lg">
        <Link
          to="/"
          activeProps={{
            className: "font-bold",
          }}
          activeOptions={{ exact: true }}
        >
          <h1>Blitz</h1>
        </Link>
        <SignedIn>
          <Link
            to="/chat"
            activeProps={{
              className: "font-bold",
            }}
          >
            Chat
          </Link>
        </SignedIn>
        <div className="ml-auto">
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton
              mode="modal"
              appearance={{
                baseTheme: theme.resolved === "dark" ? dark : undefined,
              }}
            />
          </SignedOut>
        </div>
      </div>
      <hr />
    </div>
  );
}
