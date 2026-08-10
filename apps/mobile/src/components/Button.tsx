import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "destructive";
type Size = "md" | "lg" | "sm";

interface ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  fullWidth,
  icon,
  style,
}: ButtonProps) {
  const theme = useTheme();

  const bg =
    variant === "primary"
      ? theme.primary
      : variant === "accent"
      ? theme.accent
      : variant === "destructive"
      ? theme.accent
      : variant === "secondary"
      ? theme.surfaceRaised
      : "transparent";

  const textColor =
    variant === "primary" || variant === "accent" || variant === "destructive" ? theme.textOnPrimary : theme.primary;

  const borderColor = variant === "secondary" ? theme.border : variant === "ghost" ? "transparent" : bg;

  const paddingVertical = size === "lg" ? 16 : size === "sm" ? 8 : 13;
  const fontSize = size === "lg" ? 16 : size === "sm" ? 13 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor,
          paddingVertical,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text style={[typography.bodyLg, { color: textColor, fontSize, fontWeight: "700" }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
});
