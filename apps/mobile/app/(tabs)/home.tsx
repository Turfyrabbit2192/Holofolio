import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { CardListItem } from "@/components/CardListItem";
import { EmptyState } from "@/components/EmptyState";
import { BrandMark } from "@/components/BrandMark";
import { CameraIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spacing, radius } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useAuth } from "@/state/AuthContext";
import { getDashboardStats } from "@/api/dashboard";
import { listCollection } from "@/api/collection";

export default function HomeScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const statsQuery = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardStats });
  const recentQuery = useQuery({ queryKey: ["collection", "recent"], queryFn: () => listCollection({ sort: "recent" }) });
  const topQuery = useQuery({ queryKey: ["collection", "top"], queryFn: () => listCollection({ sort: "value_desc" }) });

  const firstName = user?.displayName?.split(" ")[0];

  return (
    <ScreenContainer
      refreshing={statsQuery.isFetching || recentQuery.isFetching}
      onRefresh={() => {
        statsQuery.refetch();
        recentQuery.refetch();
        topQuery.refetch();
      }}
    >
      <BrandMark size={36} />
      <Text style={[typography.display, { color: theme.textPrimary, marginTop: spacing.lg }]}>
        Welcome back{firstName ? `, ${firstName}` : ""}!
      </Text>

      <Card style={{ marginTop: spacing.lg, backgroundColor: theme.primary, borderColor: theme.primary }}>
        <Text style={[typography.h3, { color: theme.textOnPrimary }]}>Scan a Card</Text>
        <Text style={[typography.bodySm, { color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: spacing.md }]}>
          Identify, grade, and price a card in seconds.
        </Text>
        <Button
          label="Scan Card"
          variant="accent"
          size="lg"
          icon={<CameraIcon color="#fff" size={20} />}
          onPress={() => router.push("/(tabs)/scan")}
        />
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Your Collection" actionLabel="View Dashboard" onAction={() => router.push("/dashboard")} />
        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <Text style={[typography.display, { color: theme.textPrimary }]}>
                ${(statsQuery.data?.collectionValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[typography.body, { color: theme.textSecondary, marginTop: 2 }]}>
                {statsQuery.data?.totalCards ?? 0} Cards
              </Text>
            </View>
            {statsQuery.data?.valueChangePct30d !== null && statsQuery.data?.valueChangePct30d !== undefined ? (
              <View
                style={{
                  backgroundColor: statsQuery.data.valueChangePct30d >= 0 ? theme.successSoft : theme.accentSoft,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                }}
              >
                <Text
                  style={[
                    typography.bodySm,
                    { color: statsQuery.data.valueChangePct30d >= 0 ? theme.success : theme.accent, fontWeight: "800" },
                  ]}
                >
                  {statsQuery.data.valueChangePct30d >= 0 ? "+" : ""}
                  {statsQuery.data.valueChangePct30d}% this month
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Recently Scanned" actionLabel="See all" onAction={() => router.push("/(tabs)/collection")} />
        {recentQuery.data?.items.length ? (
          recentQuery.data.items.slice(0, 5).map((item) => (
            <CardListItem key={item.id} item={item} onPress={() => router.push(`/collection/${item.id}`)} />
          ))
        ) : (
          <EmptyState title="No cards yet" subtitle="Scan your first card to get started." />
        )}
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <SectionHeader title="Top Cards" subtitle="Your highest-value cards" />
        {topQuery.data?.items.length ? (
          topQuery.data.items.slice(0, 5).map((item) => (
            <CardListItem key={item.id} item={item} onPress={() => router.push(`/collection/${item.id}`)} />
          ))
        ) : (
          <EmptyState title="Nothing here yet" subtitle="Your most valuable cards will show up once you start scanning." />
        )}
      </View>
    </ScreenContainer>
  );
}
