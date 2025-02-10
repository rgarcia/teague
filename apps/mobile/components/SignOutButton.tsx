import { useClerk } from "@clerk/clerk-expo";
import { Button } from "react-native";
import { useRouter } from "expo-router";

export const SignOutButton = () => {
  const { signOut } = useClerk();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      // Redirect to your desired page
      router.replace("/");
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    }
  };
  return <Button title="Sign out" onPress={handleSignOut} />;
};
