import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

/**
 * Original monogram mark — two overlapping trading cards (a plain design
 * cue, not a reproduction of any trademarked logo or ball/badge shape).
 */
export function BrandMark({ size = 44, showText = true }: { size?: number; showText?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Rect x="12" y="9" width="21" height="29" rx="4" fill={theme.accent} transform="rotate(-11 22.5 23.5)" />
        <Rect
          x="15"
          y="10"
          width="21"
          height="29"
          rx="4"
          fill={theme.primary}
          stroke={theme.surface}
          strokeWidth="1.6"
          transform="rotate(9 25.5 24.5)"
        />
        <Path
          d="M31.5 16.5l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1z"
          fill={theme.surface}
          transform="rotate(9 25.5 24.5)"
        />
      </Svg>
      {showText ? (
        <Text style={[typography.h2, { color: theme.textPrimary, marginLeft: spacing.sm }]}>
          Holo<Text style={{ color: theme.accent }}>folio</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
