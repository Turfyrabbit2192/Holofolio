import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { useTheme } from "@/theme";
import { typography } from "@/theme/typography";
import { spacing } from "@/theme/spacing";

export function StatTile({ label, value, delta, accent }: { label: string; value: string; delta?: string; accent?: "up" | "down" | "neutral" }) {
  const theme = useTheme();
  const deltaColor = accent === "down" ? theme.accent : accent === "up" ? theme.success : theme.textSecondary;
  return (
    <Card style={styles.card}>
      <Text style={[typography.label, { color: theme.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[typography.h1, { color: theme.textPrimary, marginTop: spacing.xxs }]}>{value}</Text>
      {delta ? <Text style={[typography.caption, { color: deltaColor, marginTop: 2 }]}>{delta}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140 },
});
