import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ data, size = 120, centerLabel }: { data: DonutDatum[]; size?: number; centerLabel?: string }) {
  const theme = useTheme();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;

  return (
    <View style={styles.row}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            {total === 0 ? (
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.backgroundAlt} strokeWidth={14} fill="none" />
            ) : (
              data.map((d, i) => {
                const fraction = d.value / total;
                const dashLength = fraction * circumference;
                const offset = cumulative;
                cumulative += dashLength;
                return (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={d.color}
                    strokeWidth={14}
                    strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                    strokeDashoffset={-offset}
                    fill="none"
                    strokeLinecap="butt"
                  />
                );
              })
            )}
          </G>
        </Svg>
        {centerLabel ? (
          <View style={[StyleSheet.absoluteFill, styles.centerLabel]}>
            <Text style={[typography.h3, { color: theme.textPrimary }]}>{centerLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        {data.map((d) => (
          <View key={d.label} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: d.color }]} />
            <Text style={[typography.bodySm, { color: theme.textSecondary, flex: 1 }]} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={[typography.bodySm, { color: theme.textPrimary, fontWeight: "700" }]}>{d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  centerLabel: { alignItems: "center", justifyContent: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
