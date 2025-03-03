import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";

export default function Page() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  // Default to chat tab
  return <Redirect href="/(home)/chat" />;
}
