import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          typography.bodyLg,
          {
            color: theme.textPrimary,
            backgroundColor: theme.surface,
            borderColor: error ? theme.accent : theme.border,
          },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[typography.caption, { color: theme.accent, marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
