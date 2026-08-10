import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PriceSourcePoint } from "@pokedex-vault/shared";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return `$${v.toFixed(2)}`;
}

export function PriceSourceRow({ point }: { point: PriceSourcePoint }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>{point.source}</Text>
        {point.note ? <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: 2 }]}>{point.note}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {point.configured ? (
          <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>
            {point.low !== null && point.high !== null && point.low !== point.high
              ? `${formatPrice(point.low)}–${formatPrice(point.high)}`
              : formatPrice(point.raw)}
          </Text>
        ) : (
          <Text style={[typography.bodySm, { color: theme.textMuted }]}>Not configured</Text>
        )}
        {point.saleCount ? <Text style={[typography.caption, { color: theme.textMuted }]}>{point.saleCount} listings</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
});
