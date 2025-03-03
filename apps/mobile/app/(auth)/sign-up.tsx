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
import { useSignUp, isClerkAPIResponseError } from "@clerk/clerk-expo";
import { ClerkAPIError } from "@clerk/types";
import { Link, Stack, useRouter } from "expo-router";
import { OtpInput } from "react-native-otp-entry";
import OAuthButtons from "@/components/OAuthButtons";
import { Colors } from "@/constants/colors";

export default function Page() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showOTPForm, setShowOTPForm] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ClerkAPIError[]>([]);
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  async function handleSignUp() {
    if (!isLoaded) return;

    setLoading(true);
    setErrors([]);

    try {
      // Start the sign-up process using the email and password method
      await signUp.create({
        emailAddress: email,
        password,
      });

      // Start the verification - a OTP code will be sent to the email
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      // Set showOTPForm to true to display second form and capture the OTP code
      setShowOTPForm(true);
    } catch (err) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.error(JSON.stringify(err, null, 2));
    }

    setLoading(false);
  }

  async function handleVerification() {
    if (!isLoaded) return;

    setLoading(true);

    try {
      // Use the code provided by the user and attempt verification
      const signInAttempt = await signUp.attemptEmailAddressVerification({
        code,
      });

      // If verification was completed, set the session to active
      // and redirect the user
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/");
      } else {
        // If the status is not complete, check why. User may need to
        // complete further steps.
        console.error(JSON.stringify(signInAttempt, null, 2));
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

        <TouchableOpacity
          style={themedStyles.continueButton}
          onPress={handleVerification}
        >
          {loading ? (
            <ActivityIndicator color={Colors[colorScheme].primaryButtonText} />
          ) : (
            <Text style={themedStyles.continueButtonText}>Continue ▸</Text>
          )}
        </TouchableOpacity>

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
      <Text style={themedStyles.title}>Create your account</Text>
      {/* <Text style={themedStyles.subtitle}>
        Welcome! Please fill in the details to get started.
      </Text> */}

      <OAuthButtons mode="SignUp" />

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

      <Text style={themedStyles.label}>Password</Text>
      <TextInput
        style={themedStyles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Enter your password"
        secureTextEntry={true}
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
        onPress={handleSignUp}
      >
        {loading ? (
          <ActivityIndicator color={Colors[colorScheme].primaryButtonText} />
        ) : (
          <Text style={themedStyles.continueButtonText}>Continue ▸</Text>
        )}
      </TouchableOpacity> */}

      <View style={themedStyles.footerTextContainer}>
        <Text style={themedStyles.footerText}>
          Already have an account?{" "}
          <Link style={themedStyles.footerTextLink} href="/sign-in">
            Sign in
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
      backgroundColor: Colors[theme].primaryButton,
      padding: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    continueButtonText: {
      color: Colors[theme].primaryButtonText,
      fontSize: 16,
      fontWeight: "bold",
    },
    backButton: {
      alignItems: "center",
      marginTop: 15,
    },
    footerTextContainer: {
      marginTop: 20,
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
