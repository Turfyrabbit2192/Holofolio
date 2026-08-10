import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SectionHeader } from "@/components/SectionHeader";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { CardListItem } from "@/components/CardListItem";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { getDashboardStats } from "@/api/dashboard";
import { listCollection } from "@/api/collection";
import { ChevronRightIcon } from "@/components/icons";

const GRADE_ORDER = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"];

export default function DashboardScreen() {
  const theme = useTheme();
  const statsQuery = useQuery({ queryKey: ["dashboard"], queryFn: getDashboardStats });
  const topQuery = useQuery({ queryKey: ["collection", "top"], queryFn: () => listCollection({ sort: "value_desc" }) });

  const stats = statsQuery.data;

  return (
    <ScreenContainer>
      <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <ChevronRightIcon color={theme.textSecondary} />
        </View>
        <Text style={[typography.body, { color: theme.textSecondary, marginLeft: 4 }]}>Back</Text>
      </Pressable>

      <Text style={[typography.h1, { color: theme.textPrimary, marginBottom: spacing.lg }]}>Collection Dashboard</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }}>
        <StatTile label="Total Cards" value={String(stats?.totalCards ?? 0)} />
        <StatTile
          label="Collection Value"
          value={`$${(stats?.collectionValue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          delta={stats?.valueChangePct30d !== null && stats?.valueChangePct30d !== undefined ? `${stats.valueChangePct30d >= 0 ? "+" : ""}${stats.valueChangePct30d}% (30d)` : undefined}
          accent={stats?.valueChangePct30d !== null && stats?.valueChangePct30d !== undefined ? (stats.valueChangePct30d >= 0 ? "up" : "down") : "neutral"}
        />
        <StatTile label="Average Grade" value={stats?.averageGrade ? stats.averageGrade.toFixed(1) : "—"} />
        <StatTile label="Highest Value Card" value={stats?.highestValueCard ? `$${stats.highestValueCard.value.toFixed(0)}` : "—"} delta={stats?.highestValueCard?.name} />
        <StatTile label="Cards Scanned" value={String(stats?.cardsScanned ?? 0)} />
        <StatTile label="Sets Collected" value={String(stats?.setsCollected ?? 0)} />
      </View>

      <SectionHeader title="Collection Value Over Time" />
      <Card style={{ marginBottom: spacing.lg }}>
        <LineChart data={(stats?.valueOverTime ?? []).map((p) => ({ label: p.date.slice(5), value: p.value }))} />
      </Card>

      <SectionHeader title="Grade Distribution" />
      <Card style={{ marginBottom: spacing.lg }}>
        <BarChart
          data={GRADE_ORDER.map((g) => ({ label: g, value: stats?.gradeDistribution[g] ?? 0 }))}
          color={theme.primary}
        />
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <SectionHeader title="Raw vs. Graded" />
          <Card>
            <DonutChart
              size={110}
              data={[
                { label: "Raw", value: stats?.rawVsGraded.raw ?? 0, color: theme.primary },
                { label: "Graded", value: stats?.rawVsGraded.graded ?? 0, color: theme.accent },
              ]}
            />
          </Card>
        </View>
      </View>

      <SectionHeader title="Grading Company Distribution" />
      <Card style={{ marginBottom: spacing.lg }}>
        <DonutChart
          size={110}
          data={[
            { label: "PSA", value: stats?.companyDistribution.PSA ?? 0, color: theme.primary },
            { label: "TAG", value: stats?.companyDistribution.TAG ?? 0, color: theme.accent },
            { label: "BGS", value: stats?.companyDistribution.BGS ?? 0, color: theme.gold },
            { label: "CGC", value: stats?.companyDistribution.CGC ?? 0, color: theme.success },
          ]}
        />
      </Card>

      <SectionHeader title="Most Valuable Cards" />
      {topQuery.data?.items.slice(0, 5).map((item) => (
        <CardListItem key={item.id} item={item} onPress={() => router.push(`/collection/${item.id}`)} />
      ))}
    </ScreenContainer>
  );
}
