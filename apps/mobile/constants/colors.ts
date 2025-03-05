/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";
const dangerColorLight = "#cc0000";
const dangerColorDark = "#ff4444";

// HSL color variables
const colorJet = "hsl(0, 0%, 4%)";
const colorUmbra = "hsl(221, 12%, 14%)";
const colorInk = "hsl(213, 11%, 16%)";
const colorAsh = "hsl(216, 5%, 19%)";
const colorSteel = "hsl(216, 4%, 22%)";
const colorFog = "hsl(216, 4%, 51%)";
const colorSilver = "hsl(213, 6%, 74%)";
const colorPewter = "hsl(213, 0%, 100%)";
const colorDove = "hsl(222, 0%, 86%)";
const colorNimbus = "hsl(228, 21.74%, 95.49%)";
const colorIvory = "hsl(40, 18%, 97%)";
const colorWhite = "hsl(0, 0%, 100%)";
const colorMidnight = "hsl(214, 58.3%, 9.4%)";
const colorEvenfall = "hsl(214, 16.1%, 28%)";
const colorBreeze = "hsl(214, 48.9%, 73.9%)";
const colorCobalt = "hsl(214.6, 60%, 45%)";
export const colorGale = "hsl(214.6, 79.1%, 62.5%)";
const colorDawn = "hsl(37, 100%, 76%)";
const colorSunset = "hsl(22, 100%, 51.6%)";
const colorRust = "hsl(22, 93.8%, 36.72%)";
const colorDusk = "hsl(263, 70%, 50.4%)";
const colorTwilight = "hsl(255, 92%, 76%)";

function hsla(hsl: string, a: string): string {
  // insert the percent before the )
  const hslArray = hsl.split(")");
  hslArray.splice(1, 0, `, ${a})`);
  const hslString = hslArray.join("").replace("hsl", "hsla");
  return hslString;
}

export const Colors = {
  light: {
    text: colorJet,
    background: colorIvory,
    backgroundTransparent: hsla(colorIvory, "0.85"),
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    danger: dangerColorLight,
    border: colorFog,
    surfaceSubtle: "#F5F5F5",
    surfaceInfo: "#E1F5FE",
    surfaceSuccess: "#E8F5E9",
    surfaceError: "#FFF5F5",
    borderSuccess: "#A5D6A7",
    borderError: dangerColorLight,
    secondaryText: "#687076",
    buttonBackground: hsla(colorWhite, "0.9"),
    buttonText: colorJet,
    inputBackground: hsla(colorWhite, "0.9"),
    inputBorder: colorFog,
    buttonPrimary: colorJet,
    buttonPrimaryPressed: hsla(colorJet, "0.7"),
    buttonPrimaryText: colorIvory,
    buttonSecondary: colorDove,
    buttonSecondaryPressed: hsla(colorDove, "0.80"),
    buttonSecondaryText: colorJet,
    link: "#11181C",
    surface: "#ffffff",
    surfaceContainer: "#f5f5f5",
  },
  dark: {
    text: colorIvory,
    background: "#1d1e20",
    backgroundTransparent: hsla(colorJet, "0.8"),
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    danger: dangerColorDark,
    border: colorFog,
    surfaceSubtle: "#1A1D1E",
    surfaceInfo: "#1E2A2E",
    surfaceSuccess: "#1E2A1E",
    surfaceError: "#2C1F1F",
    borderSuccess: "#2D4D2D",
    borderError: dangerColorDark,
    secondaryText: "#9BA1A6",
    buttonBackground: hsla(colorSteel, "0.9"),
    buttonText: colorIvory,
    inputBackground: hsla(colorSteel, "0.8"),
    inputBorder: colorFog,
    buttonPrimary: hsla(colorIvory, "0.9"),
    buttonPrimaryPressed: colorIvory,
    buttonPrimaryText: "#1d1e20",
    buttonSecondary: hsla(colorDove, "0.12"),
    buttonSecondaryPressed: hsla(colorDove, "0.20"),
    buttonSecondaryText: "#1d1e20",
    link: "#ECEDEE",
    surface: "#1A1D1E",
    surfaceContainer: "#151718",
  },
};
