/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  Link,
  Outlet,
  createRootRoute,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/tanstack-start";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import { createServerFn } from "@tanstack/react-start";
import * as React from "react";
import { getAuth } from "@clerk/tanstack-start/server";
import { getWebRequest } from "@tanstack/react-start/server";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary.js";
import { NotFound } from "~/components/NotFound.js";
import appCss from "~/styles/app.css?url";
import { createClerkClient } from "@clerk/backend";
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { fetchUserServer } from "~/utils/users";
import { ThemeProvider } from "~/components/theme-provider";

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const { userId: clerkUserId } = await getAuth(getWebRequest()!);
  if (!clerkUserId) {
    return {};
  }
  const response = await clerk.users.getUserOauthAccessToken(
    clerkUserId,
    "google"
  );
  const googleToken = response.data[0].token;

  return {
    clerkUserId,
    googleToken,
  };
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  beforeLoad: async () => {
    const [{ clerkUserId, googleToken }, user] = await Promise.all([
      fetchClerkAuth(),
      fetchUserServer(),
    ]);

    return {
      user,
      clerkUserId,
      googleToken,
    };
  },
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  return (
    <ClerkProvider>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ClerkProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <Toaster position="top-center" />
          {children}
          {process.env.NODE_ENV === "development" && (
            <>
              <ReactQueryDevtools buttonPosition="bottom-left" />
              <TanStackRouterDevtools position="bottom-right" />
            </>
          )}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
