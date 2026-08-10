import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export function SubgradeBar({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value / 10));
  const color = value >= 9 ? theme.success : value >= 7 ? theme.primary : value >= 5 ? theme.warning : theme.accent;

  return (
    <View style={styles.row}>
      <Text style={[typography.body, { color: theme.textSecondary, width: 84 }]}>{label}</Text>
      <View style={[styles.track, { backgroundColor: theme.backgroundAlt }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[typography.bodyLg, { color: theme.textPrimary, width: 34, textAlign: "right", fontWeight: "700" }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});
