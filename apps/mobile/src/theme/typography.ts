import { TextStyle } from "react-native";

type TypeScale = Record<
  "display" | "h1" | "h2" | "h3" | "bodyLg" | "body" | "bodySm" | "caption" | "label" | "mono",
  TextStyle
>;

export const typography: TypeScale = {
  display: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: "800", letterSpacing: -0.3 },
  h2: { fontSize: 21, fontWeight: "700", letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: "700" },
  bodyLg: { fontSize: 16, fontWeight: "500" },
  body: { fontSize: 14, fontWeight: "400" },
  bodySm: { fontSize: 13, fontWeight: "400" },
  caption: { fontSize: 12, fontWeight: "500" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  mono: { fontSize: 14, fontWeight: "600" },
};
