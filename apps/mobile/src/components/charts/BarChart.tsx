import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({ data, color }: { data: BarDatum[]; color?: string }) {
  const theme = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  const barColor = color ?? theme.primary;

  return (
    <View>
      {data.map((d) => (
        <View key={d.label} style={styles.row}>
          <Text style={[typography.bodySm, { color: theme.textSecondary, width: 56 }]}>{d.label}</Text>
          <View style={[styles.track, { backgroundColor: theme.backgroundAlt }]}>
            <View style={[styles.fill, { width: `${(d.value / max) * 100}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[typography.bodySm, { color: theme.textPrimary, width: 28, textAlign: "right", fontWeight: "700" }]}>{d.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.xs },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
});
