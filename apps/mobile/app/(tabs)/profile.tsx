import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Pill } from "@/components/Pill";
import { BrandMark } from "@/components/BrandMark";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "@/state/AuthContext";
import { getHealth } from "@/api/system";

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, logout } = useAuth();
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const onLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <ScreenContainer>
      <Text style={[typography.h1, { color: theme.textPrimary, marginBottom: spacing.lg }]}>Profile</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h3, { color: theme.textPrimary }]}>{user?.displayName || "Collector"}</Text>
        <Text style={[typography.body, { color: theme.textSecondary, marginTop: 2 }]}>{user?.email}</Text>
      </Card>

      <Text style={[typography.h2, { color: theme.textPrimary, marginBottom: spacing.sm }]}>Data Sources</Text>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>AI Card Identification</Text>
          <Pill
            label={healthQuery.data?.claudeVisionConfigured ? "Connected" : "Not configured"}
            tone={healthQuery.data?.claudeVisionConfigured ? "success" : "warning"}
          />
        </View>
        <Text style={[typography.bodySm, { color: theme.textMuted }]}>
          Card grading always runs from real photo analysis. Market pricing combines TCGplayer/Cardmarket data with any
          additional sources your server administrator has configured.
        </Text>
      </Card>

      <Text style={[typography.h2, { color: theme.textPrimary, marginBottom: spacing.sm }]}>About Estimates</Text>
      <Card style={{ marginBottom: spacing.xl }}>
        <Text style={[typography.bodySm, { color: theme.textSecondary }]}>
          Grades shown in Holofolio are AI-generated estimates based on computer-vision analysis of your photos and
          publicly known grading philosophies. They are not official grades from PSA, TAG, Beckett/BGS, or CGC.
          Prices are estimates aggregated from available market data sources and are not a guarantee of what any card
          would sell for.
        </Text>
      </Card>

      <Button label="Sign Out" variant="destructive" onPress={onLogout} />

      <View style={{ alignItems: "center", marginTop: spacing.xxl }}>
        <BrandMark size={28} />
        <Text style={[typography.caption, { color: theme.textMuted, marginTop: spacing.sm }]}>Holofolio v1.0.0</Text>
      </View>
    </ScreenContainer>
  );
}
