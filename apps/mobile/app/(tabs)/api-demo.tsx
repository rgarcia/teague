import { View, Text, Pressable } from "react-native";
import { useState } from "react";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export default function ApiDemoScreen() {
  const colorScheme = useColorScheme();
  const [apiResponse, setApiResponse] = useState<string>("");

  async function fetchFromApi() {
    try {
      const response = await fetch(`${BASE_URL}/api/demo`);
      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setApiResponse("Error fetching data: " + (error as Error).message);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: Colors[colorScheme ?? "light"].background,
      }}
    >
      <Pressable
        onPress={fetchFromApi}
        style={({ pressed }) => ({
          backgroundColor: Colors[colorScheme ?? "light"].tint,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 8,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text
          style={{
            color: Colors[colorScheme ?? "light"].background,
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          Fetch from API
        </Text>
      </Pressable>
      {apiResponse ? (
        <Text
          style={{
            marginTop: 20,
            padding: 10,
            color: Colors[colorScheme ?? "light"].text,
          }}
        >
          {apiResponse}
        </Text>
      ) : null}
    </View>
  );
}
