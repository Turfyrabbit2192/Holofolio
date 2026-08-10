import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme";
import { typography } from "@/theme/typography";

function gradeColor(grade: number, theme: ReturnType<typeof useTheme>) {
  if (grade >= 9) return theme.success;
  if (grade >= 7) return theme.primary;
  if (grade >= 5) return theme.warning;
  return theme.accent;
}

export function gradeLabel(grade: number): string {
  if (grade >= 10) return "Gem Mint / Pristine";
  if (grade >= 9) return "Mint";
  if (grade >= 8) return "Near Mint";
  if (grade >= 7) return "Very Good";
  if (grade >= 6) return "Excellent";
  if (grade >= 5) return "Average";
  if (grade >= 4) return "Below Average";
  if (grade >= 3) return "Very Poor";
  if (grade >= 2) return "Poor";
  return "Extremely Poor";
}

export function GradeBadge({ grade, size = 64 }: { grade: number; size?: number }) {
  const theme = useTheme();
  const color = gradeColor(grade, theme);
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          backgroundColor: theme.surface,
        },
      ]}
    >
      <Text style={[typography.h2, { color: theme.textPrimary, fontSize: size * 0.32 }]}>{Math.round(grade)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
