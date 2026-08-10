import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export function SelectChips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.primary : theme.backgroundAlt,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}
          >
            <Text style={[typography.bodySm, { color: active ? theme.textOnPrimary : theme.textSecondary, fontWeight: "600" }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5 },
});
