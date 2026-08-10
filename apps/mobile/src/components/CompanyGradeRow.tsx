import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CompanyGradeEstimate } from "@pokedex-vault/shared";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export function CompanyGradeRow({ estimate }: { estimate: CompanyGradeEstimate }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
        <Text style={[typography.caption, { color: theme.primary, fontWeight: "800" }]}>{estimate.company}</Text>
      </View>
      <Text style={[typography.h3, { color: theme.textPrimary, flex: 1, marginLeft: spacing.sm }]}>{estimate.overall}</Text>
      <Text style={[typography.bodySm, { color: theme.textMuted }]}>{estimate.scale}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 46,
    alignItems: "center",
  },
});
