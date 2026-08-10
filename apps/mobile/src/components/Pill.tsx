import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

type Tone = "neutral" | "primary" | "accent" | "success" | "warning";

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const colors: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: theme.backgroundAlt, fg: theme.textSecondary },
    primary: { bg: theme.primarySoft, fg: theme.primary },
    accent: { bg: theme.accentSoft, fg: theme.accent },
    success: { bg: theme.successSoft, fg: theme.success },
    warning: { bg: theme.warningSoft, fg: theme.warning },
  };
  const c = colors[tone];
  return (
    <View style={[styles.base, { backgroundColor: c.bg }]}>
      <Text style={[typography.caption, { color: c.fg, fontWeight: "700" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
});
