import { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { useSignIn, isClerkAPIResponseError } from "@clerk/clerk-expo";
import {
  ClerkAPIError,
  EmailCodeFactor,
  SignInFirstFactor,
} from "@clerk/types";
import { Link, useRouter, Stack } from "expo-router";
import OAuthButtons from "@/components/OAuthButtons";
import { OtpInput } from "react-native-otp-entry";
import { Colors } from "@/constants/colors";

export default function Page() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showOTPForm, setShowOTPForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ClerkAPIError[]>([]);
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  async function handleEmailSignIn() {
    if (!isLoaded) return;

    setLoading(true);
    setErrors([]);

    try {
      // Start the sign-in process using the email method
      const { supportedFirstFactors } = await signIn.create({
        identifier: email,
      });

      // Filter the returned array to find the 'email' entry
      const isEmailCodeFactor = (
        factor: SignInFirstFactor
      ): factor is EmailCodeFactor => {
        return factor.strategy === "email_code";
      };
      const emailCodeFactor = supportedFirstFactors?.find(isEmailCodeFactor);

      if (emailCodeFactor) {
        // Grab the emailAddressId
        const { emailAddressId } = emailCodeFactor;

        // Send the OTP code to the user
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId,
        });

        // Set showOTPForm to true to display second form and capture the OTP code
        setShowOTPForm(true);
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setErrors(err.errors);
      }
      console.error(JSON.stringify(err, null, 2));
    }

    setLoading(false);
  }

  async function handleVerification() {
    if (!isLoaded) return;

    setLoading(true);
    setErrors([]);

    try {
      // Use the code provided by the user and attempt verification
      const completeSignIn = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });

      // If verification was completed, set the session to active
      // and redirect the user
      if (completeSignIn.status === "complete") {
        await setActive({ session: completeSignIn.createdSessionId });
        router.replace("/");
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error(JSON.stringify(completeSignIn, null, 2));
      }
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      if (isClerkAPIResponseError(err)) {
        setErrors(err.errors);
      }
      console.error(JSON.stringify(err, null, 2));
    }

    setLoading(false);
  }

  if (showOTPForm) {
    return (
      <View style={themedStyles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={themedStyles.title}>Check your email</Text>
        <Text style={themedStyles.subtitle}>to continue to your app</Text>

        <OtpInput
          focusColor={Colors[colorScheme].border}
          theme={{
            containerStyle: { marginBottom: 15 },
          }}
          numberOfDigits={6}
          onTextChange={setCode}
        />

        {errors.length > 0 && (
          <View style={themedStyles.errorContainer}>
            {errors.map((error, index) => (
              <Text key={index} style={themedStyles.errorMessage}>
                • {error.longMessage}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={themedStyles.continueButton}
          onPress={handleVerification}
        >
          {loading ? (
            <ActivityIndicator color={Colors[colorScheme].buttonPrimaryText} />
          ) : (
            <Text style={themedStyles.continueButtonText}>Continue ▸</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={themedStyles.backButton}
          onPress={() => setShowOTPForm(false)}
        >
          <Text style={themedStyles.footerTextLink}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={themedStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={themedStyles.title}>Sign in to Blitz</Text>
      {/* <Text style={themedStyles.subtitle}>
        Welcome back! Please sign in to continue
      </Text> */}

      <OAuthButtons />

      {/* <Text style={themedStyles.orSeparator}>or</Text>

      <Text style={themedStyles.label}>Email address</Text>
      <TextInput
        style={themedStyles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Enter your email"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={Colors[colorScheme].secondaryText}
      />

      {errors.length > 0 && (
        <View style={themedStyles.errorContainer}>
          {errors.map((error, index) => (
            <Text key={index} style={themedStyles.errorMessage}>
              • {error.longMessage}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={themedStyles.continueButton}
        onPress={handleEmailSignIn}
      >
        {loading ? (
          <ActivityIndicator color={Colors[colorScheme].buttonPrimaryText} />
        ) : (
          <Text style={themedStyles.continueButtonText}>Continue ▸</Text>
        )}
      </TouchableOpacity> */}

      <View style={themedStyles.footerTextContainer}>
        <Text style={themedStyles.footerText}>
          Don't' have an account?{" "}
          <Link style={themedStyles.footerTextLink} href="/sign-up">
            Sign up
          </Link>
        </Text>
      </View>
    </View>
  );
}

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: 16,
      width: "100%",
      alignSelf: "center",
      backgroundColor: Colors[theme].background,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 24,
      color: Colors[theme].text,
    },
    subtitle: {
      fontSize: 16,
      color: Colors[theme].secondaryText,
      textAlign: "center",
      marginBottom: 24,
    },
    orSeparator: {
      textAlign: "center",
      marginVertical: 15,
      color: Colors[theme].secondaryText,
    },
    label: {
      fontSize: 16,
      marginBottom: 5,
      color: Colors[theme].text,
    },
    input: {
      borderWidth: 1,
      borderColor: Colors[theme].inputBorder,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      marginBottom: 15,
      backgroundColor: Colors[theme].inputBackground,
      color: Colors[theme].text,
    },
    errorContainer: {
      marginBottom: 15,
    },
    errorMessage: {
      color: Colors[theme].danger,
      fontSize: 14,
      marginBottom: 5,
    },
    continueButton: {
      backgroundColor: Colors[theme].buttonPrimary,
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    continueButtonText: {
      color: Colors[theme].buttonPrimaryText,
      fontSize: 16,
      fontWeight: "bold",
    },
    backButton: {
      alignItems: "center",
      marginTop: 15,
    },
    footerTextContainer: {
      marginTop: 16,
      alignItems: "center",
    },
    footerText: {
      fontSize: 16,
      color: Colors[theme].secondaryText,
    },
    footerTextLink: {
      color: Colors[theme].link,
      fontWeight: "bold",
    },
  });
const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
