import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { Link } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { SignOutButton } from "@/components/SignOutButton";
import { Colors } from "@/constants/colors";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Page() {
  const { isSignedIn } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  return (
    <SafeAreaView style={themedStyles.container} edges={["top"]}>
      <View style={themedStyles.content}>
        <Text style={themedStyles.title}>Cannon</Text>
        <Text style={themedStyles.subtitle}>
          Wanna blast through your inbox today?
        </Text>

        {!isSignedIn ? (
          <>
            <Link href="/sign-in" asChild>
              <TouchableOpacity style={themedStyles.button}>
                <Text style={themedStyles.buttonText}>Sign In</Text>
              </TouchableOpacity>
            </Link>

            <Link href="/sign-up" asChild>
              <TouchableOpacity style={themedStyles.button}>
                <Text style={themedStyles.buttonText}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
          </>
        ) : null}

        {isSignedIn ? (
          <>
            <Link href="/chat" asChild>
              <TouchableOpacity style={themedStyles.button}>
                <Text style={themedStyles.buttonText}>Chat</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/profile" asChild>
              <TouchableOpacity style={themedStyles.button}>
                <Text style={themedStyles.buttonText}>Profile</Text>
              </TouchableOpacity>
            </Link>
          </>
        ) : null}

        {isSignedIn ? <SignOutButton /> : null}
      </View>
    </SafeAreaView>
  );
}

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].background,
    },
    content: {
      flex: 1,
      padding: 20,
      width: "100%",
      alignSelf: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 10,
      color: Colors[theme].text,
    },
    subtitle: {
      fontSize: 16,
      color: Colors[theme].secondaryText,
      textAlign: "center",
      marginBottom: 20,
    },
    button: {
      padding: 12,
      borderRadius: 8,
      marginBottom: 12,
      backgroundColor: Colors[theme].buttonBackground,
      borderWidth: 1,
      borderColor: Colors[theme].border,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: {
      color: Colors[theme].buttonText,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
    },
  });

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
