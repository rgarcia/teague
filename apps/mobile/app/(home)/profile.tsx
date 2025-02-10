import React from "react";
import { useClerk, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  useColorScheme,
} from "react-native";
import { Colors } from "@/constants/colors";

export default function Page() {
  const { user } = useUser();
  const clerk = useClerk();
  const router = useRouter();

  const colorScheme = useColorScheme() ?? "light";
  const themedStyles = styles[colorScheme];

  const handleSignOut = async () => {
    await clerk.signOut();
    router.replace("/");
  };

  if (user === undefined) {
    return <Text style={themedStyles.text}>Loading...</Text>;
  }

  if (user === null) {
    return <Text style={themedStyles.text}>Not signed in</Text>;
  }

  return (
    <ScrollView style={themedStyles.container}>
      <View style={themedStyles.header}>
        <Image
          source={{ uri: user.imageUrl }}
          style={themedStyles.profileImage}
        />
        <Text style={themedStyles.name}>{user.fullName || "User"}</Text>
        <Text style={themedStyles.email}>
          {user.primaryEmailAddress?.emailAddress}
        </Text>
      </View>

      <View style={themedStyles.infoSection}>
        <InfoItem
          label="Username"
          value={user.username || "Not set"}
          styles={themedStyles}
        />
        <InfoItem label="ID" value={user.id} styles={themedStyles} />
        <InfoItem
          label="Created"
          value={new Date(user.createdAt!).toLocaleDateString()}
          styles={themedStyles}
        />
        <InfoItem
          label="Last Updated"
          value={new Date(user.updatedAt!).toLocaleDateString()}
          styles={themedStyles}
        />
      </View>

      <TouchableOpacity
        style={themedStyles.signOutButton}
        onPress={handleSignOut}
      >
        <Text style={themedStyles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={themedStyles.backButton}
        onPress={() => router.push("/")}
      >
        <Text style={themedStyles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const InfoItem = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createThemedStyles>;
}) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}:</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const createThemedStyles = (theme: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors[theme].surfaceContainer,
    },
    header: {
      alignItems: "center",
      padding: 20,
      backgroundColor: Colors[theme].surface,
    },
    profileImage: {
      width: 100,
      height: 100,
      borderRadius: 50,
      marginBottom: 10,
    },
    name: {
      fontSize: 22,
      fontWeight: "bold",
      marginBottom: 5,
      color: Colors[theme].text,
    },
    email: {
      fontSize: 16,
      color: Colors[theme].secondaryText,
    },
    infoSection: {
      backgroundColor: Colors[theme].surface,
      marginTop: 20,
      padding: 20,
    },
    infoItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    infoLabel: {
      fontWeight: "bold",
      color: Colors[theme].text,
    },
    infoValue: {
      color: Colors[theme].secondaryText,
    },
    signOutButton: {
      backgroundColor: Colors[theme].primaryButton,
      padding: 15,
      borderRadius: 8,
      margin: 20,
      alignItems: "center",
    },
    signOutButtonText: {
      color: Colors[theme].primaryButtonText,
      fontSize: 16,
      fontWeight: "bold",
    },
    backButton: {
      alignItems: "center",
      marginTop: 15,
    },
    backButtonText: {
      color: Colors[theme].link,
      fontWeight: "bold",
    },
    text: {
      color: Colors[theme].text,
    },
  });

const styles = {
  light: createThemedStyles("light"),
  dark: createThemedStyles("dark"),
} as const;
