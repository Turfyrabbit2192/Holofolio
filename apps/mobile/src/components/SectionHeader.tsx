import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export function SectionHeader({ title, actionLabel, onAction, subtitle }: { title: string; actionLabel?: string; onAction?: () => void; subtitle?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.h2, { color: theme.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[typography.bodySm, { color: theme.primary, fontWeight: "700" }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", marginBottom: spacing.sm, gap: spacing.sm },
});
