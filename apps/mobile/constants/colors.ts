/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";
const dangerColorLight = "#cc0000";
const dangerColorDark = "#ff4444";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    danger: dangerColorLight,
    border: "#E5E5E5",
    surfaceSubtle: "#F5F5F5",
    surfaceInfo: "#E1F5FE",
    surfaceSuccess: "#E8F5E9",
    surfaceError: "#FFF5F5",
    borderSuccess: "#A5D6A7",
    borderError: dangerColorLight,
    secondaryText: "#687076",
    buttonBackground: "#ffffff",
    buttonText: "#11181C",
    inputBackground: "#ffffff",
    inputBorder: "#e0e0e0",
    primaryButton: "rgba(0, 0, 0, 0.8)",
    primaryButtonText: "#ffffff",
    link: "#11181C",
    surface: "#ffffff",
    surfaceContainer: "#f5f5f5",
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    danger: dangerColorDark,
    border: "#2D2D2D",
    surfaceSubtle: "#1A1D1E",
    surfaceInfo: "#1E2A2E",
    surfaceSuccess: "#1E2A1E",
    surfaceError: "#2C1F1F",
    borderSuccess: "#2D4D2D",
    borderError: dangerColorDark,
    secondaryText: "#9BA1A6",
    buttonBackground: "#1A1D1E",
    buttonText: "#ECEDEE",
    inputBackground: "#1A1D1E",
    inputBorder: "#2D2D2D",
    primaryButton: "#ffffff",
    primaryButtonText: "#151718",
    link: "#ECEDEE",
    surface: "#1A1D1E",
    surfaceContainer: "#151718",
  },
};
