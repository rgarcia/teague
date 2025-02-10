import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false, // This hides the navigation header with "index" text
        }}
      />
      <Stack.Screen
        name="chat"
        options={{
          headerBackTitle: " ", // This hides the back text on iOS
          headerBackTitleVisible: false, // This also helps ensure no back text is shown
        }}
      />
    </Stack>
  );
}
