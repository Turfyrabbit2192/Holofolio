import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { CardListItem } from "@/components/CardListItem";
import { EmptyState } from "@/components/EmptyState";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";
import { SearchIcon, FilterIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spacing, radius } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { listCollection, CollectionFilters } from "@/api/collection";

const SORT_OPTIONS: { key: NonNullable<CollectionFilters["sort"]>; label: string }[] = [
  { key: "recent", label: "Recently Scanned" },
  { key: "oldest", label: "Oldest Scanned" },
  { key: "value_desc", label: "Highest Value" },
  { key: "value_asc", label: "Lowest Value" },
  { key: "grade_desc", label: "Highest Grade" },
  { key: "grade_asc", label: "Lowest Grade" },
  { key: "alpha", label: "Alphabetical" },
];

const CONDITION_OPTIONS = ["All", "Raw", "Graded"];
const COMPANY_OPTIONS = ["All", "PSA", "TAG", "BGS", "CGC"];

export default function CollectionScreen() {
  const theme = useTheme();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<NonNullable<CollectionFilters["sort"]>>("recent");
  const [condition, setCondition] = useState("All");
  const [company, setCompany] = useState("All");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filters: CollectionFilters = {
    q: q || undefined,
    sort,
    condition: condition === "All" ? undefined : (condition as "Raw" | "Graded"),
    gradingCompany: company === "All" ? undefined : company,
  };

  const query = useQuery({ queryKey: ["collection", filters], queryFn: () => listCollection(filters) });

  return (
    <ScreenContainer scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Text style={[typography.h1, { color: theme.textPrimary, marginBottom: spacing.md }]}>Collection</Text>
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SearchIcon color={theme.textMuted} />
            <TextField
              placeholder="Search by name, set, or number"
              value={q}
              onChangeText={setQ}
              style={{ borderWidth: 0, flex: 1, paddingVertical: 8 }}
            />
          </View>
          <Pressable
            onPress={() => setFiltersOpen((v) => !v)}
            style={[styles.filterButton, { backgroundColor: filtersOpen ? theme.primary : theme.surface, borderColor: theme.border }]}
          >
            <FilterIcon color={filtersOpen ? "#fff" : theme.textSecondary} />
          </Pressable>
        </View>

        {filtersOpen && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Condition</Text>
            <View style={{ marginBottom: spacing.sm }}>
              <SelectChips options={CONDITION_OPTIONS} value={condition} onChange={setCondition} />
            </View>
            <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Grading Company</Text>
            <View style={{ marginBottom: spacing.sm }}>
              <SelectChips options={COMPANY_OPTIONS} value={company} onChange={setCompany} />
            </View>
          </View>
        )}

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={SORT_OPTIONS}
          keyExtractor={(o) => o.key}
          style={{ marginBottom: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSort(item.key)}
              style={[
                styles.sortChip,
                { backgroundColor: sort === item.key ? theme.accentSoft : "transparent", borderColor: sort === item.key ? theme.accent : theme.border },
              ]}
            >
              <Text style={[typography.bodySm, { color: sort === item.key ? theme.accent : theme.textSecondary, fontWeight: "700" }]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
        refreshing={query.isFetching}
        onRefresh={() => query.refetch()}
        renderItem={({ item }) => <CardListItem item={item} onPress={() => router.push(`/collection/${item.id}`)} />}
        ListEmptyComponent={
          <EmptyState
            title={query.isLoading ? "Loading…" : "No cards found"}
            subtitle={query.isLoading ? undefined : "Try adjusting your search or filters, or scan a new card."}
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginBottom: spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  filterButton: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  sortChip: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, marginRight: spacing.xs },
});
