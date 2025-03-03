import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useOAuth } from "@clerk/clerk-expo";
import { OAuthStrategy } from "@clerk/types";
import { Colors } from "../constants/colors";
import Svg, { Path } from "react-native-svg";

interface SSOButtonProps {
  icon: string;
  text: string;
  onPress: () => void;
}

const useWarmUpBrowser = () => {
  useEffect(() => {
    // Warm up the android browser to improve UX
    // https://docs.expo.dev/guides/authentication/#improving-user-experience
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

const SSOButton: React.FC<SSOButtonProps> = ({ icon, text, onPress }) => {
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  return (
    <TouchableOpacity style={themedStyles.ssoButton} onPress={onPress}>
      <FontAwesome
        name={icon as any}
        size={20}
        color="black"
        style={themedStyles.icon}
      />
      <Text style={themedStyles.ssoButtonText}>{text}</Text>
    </TouchableOpacity>
  );
};

export default function OAuthButtons({
  mode = "SignIn",
}: {
  mode?: "SignIn" | "SignUp";
}) {
  useWarmUpBrowser();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  const { startOAuthFlow: startGoogleOAuthFlow } = useOAuth({
    strategy: "oauth_google",
  });
  // const { startOAuthFlow: startGitHubOAuthFlow } = useOAuth({
  //   strategy: "oauth_github",
  // });
  const router = useRouter();

  async function handleSSO(strategy: OAuthStrategy) {
    let startOAuthFlow: typeof startGoogleOAuthFlow;

    if (strategy === "oauth_google") {
      startOAuthFlow = startGoogleOAuthFlow;
      // } else if (strategy === "oauth_github") {
      //   startOAuthFlow = startGitHubOAuthFlow;
    } else {
      throw new Error(`Unsupported strategy: ${strategy}`);
    }

    try {
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/profile", { scheme: "cannon" }),
      });

      if (createdSessionId) {
        setActive!({ session: createdSessionId });
        router.push("/");
      } else {
        // Use signIn or signUp for next steps such as MFA
      }
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    }
  }

  return (
    <View>
      {/* <SSOButton
        icon="github"
        text="GitHub"
        onPress={() => handleSSO("oauth_github")}
      /> */}
      {/* <SSOButton
        icon="google"
        text="Google"
        onPress={() => handleSSO("oauth_google")}
      /> */}
      <TouchableOpacity
        style={themedStyles.ssoButton}
        onPress={() => handleSSO("oauth_google")}
      >
        <Svg
          width={24}
          height={24}
          viewBox="0 0 48 48"
          style={{ marginRight: 10 }}
        >
          <Path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <Path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <Path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <Path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </Svg>
        <Text style={themedStyles.ssoButtonText}>
          {mode === "SignIn" ? "Sign in with Google" : "Sign up with Google"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    ssoButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      borderRadius: 8,
      marginBottom: 12,
      backgroundColor:
        theme === "dark"
          ? Colors.dark.buttonBackground
          : Colors.light.buttonBackground,
      borderWidth: 1,
      borderColor: theme === "dark" ? Colors.dark.border : Colors.light.border,
    },
    ssoButtonText: {
      color: theme === "dark" ? Colors.dark.text : Colors.light.text,
      fontSize: 16,
      fontWeight: "bold",
    },
    icon: {
      marginRight: 10,
    },
  });

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
