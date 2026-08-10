import { useColorScheme } from "react-native";
import { amber, blue, gold, green, red, slate } from "./palette";

export interface ThemeTokens {
  mode: "light" | "dark";
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  gold: string;
  shadow: string;
}

const light: ThemeTokens = {
  mode: "light",
  background: slate[50],
  backgroundAlt: slate[100],
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  border: slate[200],
  borderStrong: slate[300],
  textPrimary: slate[900],
  textSecondary: slate[600],
  textMuted: slate[400],
  textOnPrimary: "#FFFFFF",
  primary: blue[600],
  primaryStrong: blue[800],
  primarySoft: blue[50],
  accent: red[600],
  accentStrong: red[700],
  accentSoft: red[50],
  success: green[600],
  successSoft: green[100],
  warning: amber[600],
  warningSoft: amber[100],
  gold: gold[500],
  shadow: "rgba(15, 23, 42, 0.12)",
};

const dark: ThemeTokens = {
  mode: "dark",
  background: slate[950],
  backgroundAlt: slate[900],
  surface: slate[850],
  surfaceRaised: slate[800],
  border: slate[700],
  borderStrong: slate[600],
  textPrimary: slate[50],
  textSecondary: slate[300],
  textMuted: slate[500],
  textOnPrimary: "#FFFFFF",
  primary: blue[400],
  primaryStrong: blue[300],
  primarySoft: "rgba(46, 104, 232, 0.16)",
  accent: red[400],
  accentStrong: red[300],
  accentSoft: "rgba(230, 46, 56, 0.16)",
  success: green[500],
  successSoft: "rgba(31, 169, 113, 0.16)",
  warning: amber[500],
  warningSoft: "rgba(227, 154, 43, 0.16)",
  gold: gold[400],
  shadow: "rgba(0, 0, 0, 0.4)",
};

export function useTheme(): ThemeTokens {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}

export { spacing, radius } from "./spacing";
export { typography } from "./typography";
