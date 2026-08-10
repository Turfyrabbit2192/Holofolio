import React from "react";
import { RefreshControl, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ScreenContainer({ children, scroll = true, padded = true, style, refreshing, onRefresh }: ScreenContainerProps) {
  const theme = useTheme();

  const content = padded ? <View style={[styles.padded, !scroll && styles.paddedFlex]}>{children}</View> : children;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={["top"]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={style}
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.primary} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.flex, style]}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  paddedFlex: { flex: 1 },
});
