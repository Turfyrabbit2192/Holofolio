import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { CollectionItemDTO } from "@pokedex-vault/shared";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { Pill } from "./Pill";
import { imageUrl } from "@/api/client";

export function CardListItem({ item, onPress }: { item: CollectionItemDTO; onPress: () => void }) {
  const theme = useTheme();
  const grade = item.latestGrade?.aiOverallGrade;
  const value = item.latestPricing?.estimatedValue;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Image source={{ uri: imageUrl(item.frontImageUrl) }} style={[styles.thumb, { backgroundColor: theme.backgroundAlt }]} resizeMode="cover" />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]} numberOfLines={1}>
          {item.card.name || "Unidentified card"}
        </Text>
        <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: 2 }]} numberOfLines={1}>
          {item.card.set} {item.card.cardNumber ? `#${item.card.cardNumber}` : ""}
        </Text>
        <View style={styles.pillRow}>
          <Pill label={item.condition} tone={item.condition === "Graded" ? "primary" : "neutral"} />
          {item.gradingCompany ? <Pill label={item.gradingCompany} tone="accent" /> : null}
        </View>
      </View>
      <View style={styles.rightCol}>
        {grade !== undefined ? (
          <Text style={[typography.h3, { color: theme.textPrimary }]}>{grade.toFixed(1)}</Text>
        ) : null}
        {value !== null && value !== undefined ? (
          <Text style={[typography.bodySm, { color: theme.success, fontWeight: "700" }]}>${value.toFixed(0)}</Text>
        ) : (
          <Text style={[typography.caption, { color: theme.textMuted }]}>No price</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  thumb: { width: 52, height: 72, borderRadius: radius.sm },
  pillRow: { flexDirection: "row", gap: spacing.xxs, marginTop: spacing.xxs },
  rightCol: { alignItems: "flex-end", justifyContent: "center", gap: 2 },
});
