import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { SelectChips } from "@/components/SelectChips";
import { PriceSourceRow } from "@/components/PriceSourceRow";
import { Pill } from "@/components/Pill";
import { EmptyState } from "@/components/EmptyState";
import { SearchIcon, ChevronRightIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spacing, radius } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { searchCards, getCardPrice, fetchSets, fetchCardsBySet, CardSearchResult, CardSet } from "@/api/cards";
import { ApiError } from "@/api/client";
import type { PricingResult } from "@pokedex-vault/shared";

const HOLO_TYPES = ["Non-Holo", "Holo", "Reverse Holo"];
const MODES = ["Search", "Browse Sets"] as const;

export default function PricesScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<(typeof MODES)[number]>("Search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [browseSet, setBrowseSet] = useState<CardSet | null>(null);
  const setsQuery = useQuery({ queryKey: ["card-sets"], queryFn: fetchSets, enabled: mode === "Browse Sets" });
  const setCardsQuery = useQuery({
    queryKey: ["set-cards", browseSet?.id],
    queryFn: () => fetchCardsBySet(browseSet!.id),
    enabled: mode === "Browse Sets" && !!browseSet,
  });

  const [selected, setSelected] = useState<CardSearchResult | null>(null);
  const [holoType, setHoloType] = useState("Non-Holo");
  const [pricing, setPricing] = useState<PricingResult | null>(null);

  const priceMutation = useMutation({
    mutationFn: ({ id, holo }: { id: string; holo: string }) => getCardPrice(id, holo),
    onSuccess: (data) => setPricing(data.pricing),
  });

  const switchMode = (next: (typeof MODES)[number]) => {
    setMode(next);
    setBrowseSet(null);
    setSelected(null);
    setPricing(null);
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSelected(null);
    setPricing(null);
    try {
      const { results } = await searchCards(query.trim());
      setResults(results);
      if (results.length === 0) setSearchError("No cards matched that search.");
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : "Search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  };

  const selectCard = (card: CardSearchResult) => {
    setSelected(card);
    setPricing(null);
    priceMutation.mutate({ id: card.id, holo: holoType });
  };

  const displayResults = mode === "Search" ? results : browseSet ? setCardsQuery.data?.results ?? [] : [];

  return (
    <ScreenContainer>
      <Text style={[typography.h1, { color: theme.textPrimary }]}>Prices</Text>
      <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
        Look up current market pricing for any Pokémon card.
      </Text>

      <View style={{ marginBottom: spacing.md }}>
        <SelectChips options={[...MODES]} value={mode} onChange={(v) => switchMode(v as (typeof MODES)[number])} />
      </View>

      {mode === "Search" ? (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <TextField placeholder="Search by Pokémon name" value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" />
            </View>
            <Button label="Search" onPress={runSearch} loading={searching} icon={<SearchIcon color="#fff" size={16} />} />
          </View>
          {searchError ? <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.sm }]}>{searchError}</Text> : null}
        </>
      ) : browseSet ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Pressable onPress={() => setBrowseSet(null)} style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.sm }}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <ChevronRightIcon color={theme.textSecondary} />
            </View>
            <Text style={[typography.body, { color: theme.textSecondary, marginLeft: 4 }]}>All Sets</Text>
          </Pressable>
          <Text style={[typography.h3, { color: theme.textPrimary }]}>{browseSet.name}</Text>
          <Text style={[typography.bodySm, { color: theme.textSecondary }]}>
            {browseSet.series} · {browseSet.total} cards
          </Text>
          {setCardsQuery.isLoading ? <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.lg }} /> : null}
          {setCardsQuery.isError ? (
            <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.sm }]}>Couldn't load this set's cards. Please try again.</Text>
          ) : null}
        </View>
      ) : (
        <View style={{ marginBottom: spacing.sm }}>
          {setsQuery.isLoading ? <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.lg }} /> : null}
          {setsQuery.isError ? (
            <Text style={[typography.bodySm, { color: theme.textMuted }]}>Couldn't load the set list. Please try again.</Text>
          ) : null}
          {setsQuery.data?.sets.map((set) => (
            <Pressable
              key={set.id}
              onPress={() => setBrowseSet(set)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: spacing.sm,
                borderRadius: radius.md,
                marginBottom: spacing.xs,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              {set.images.symbol ? (
                <Image source={{ uri: set.images.symbol }} style={{ width: 28, height: 28 }} resizeMode="contain" />
              ) : null}
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>{set.name}</Text>
                <Text style={[typography.bodySm, { color: theme.textSecondary }]}>
                  {set.series} · {set.printedTotal} cards{set.releaseDate ? ` · ${set.releaseDate}` : ""}
                </Text>
              </View>
              <ChevronRightIcon color={theme.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {displayResults.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          {displayResults.map((card) => (
            <Pressable
              key={card.id}
              onPress={() => selectCard(card)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: spacing.sm,
                borderRadius: radius.md,
                marginBottom: spacing.xs,
                backgroundColor: selected?.id === card.id ? theme.primarySoft : theme.surface,
                borderWidth: 1,
                borderColor: selected?.id === card.id ? theme.primary : theme.border,
              }}
            >
              {card.images.small ? (
                <Image source={{ uri: card.images.small }} style={{ width: 40, height: 56, borderRadius: 6 }} resizeMode="contain" />
              ) : null}
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>{card.name}</Text>
                <Text style={[typography.bodySm, { color: theme.textSecondary }]}>
                  {card.set.name} #{card.number}
                </Text>
              </View>
              {card.rarity ? <Pill label={card.rarity} /> : null}
            </Pressable>
          ))}
        </View>
      )}

      {selected && (
        <Card style={{ marginBottom: spacing.xl }}>
          <Text style={[typography.h3, { color: theme.textPrimary }]}>{selected.name}</Text>
          <Text style={[typography.bodySm, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
            {selected.set.name} #{selected.number}
          </Text>
          <SelectChips
            options={HOLO_TYPES}
            value={holoType}
            onChange={(v) => {
              setHoloType(v);
              priceMutation.mutate({ id: selected.id, holo: v });
            }}
          />

          {priceMutation.isPending ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.lg }} />
          ) : pricing ? (
            <View style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={[typography.display, { color: theme.textPrimary }]}>
                  {pricing.estimatedValue !== null ? `$${pricing.estimatedValue.toFixed(2)}` : "—"}
                </Text>
                <Pill
                  label={`${pricing.confidence} confidence`}
                  tone={pricing.confidence === "High" ? "success" : pricing.confidence === "Medium" ? "primary" : "warning"}
                />
              </View>
              <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: 4, marginBottom: spacing.sm }]}>
                {pricing.confidenceNote}
              </Text>
              {pricing.sourcesUsed.map((p) => (
                <PriceSourceRow key={p.source} point={p} />
              ))}
            </View>
          ) : null}
        </Card>
      )}

      {mode === "Search" && results.length === 0 && !searching && !searchError && (
        <EmptyState title="Search for a card" subtitle="Find current raw and graded market pricing from your connected sources." />
      )}
      {mode === "Browse Sets" && !browseSet && !setsQuery.isLoading && setsQuery.data?.sets.length === 0 && (
        <EmptyState title="No sets found" subtitle="The set catalog is temporarily unavailable." />
      )}
      {mode === "Browse Sets" &&
        browseSet &&
        !setCardsQuery.isLoading &&
        !setCardsQuery.isError &&
        setCardsQuery.data?.results.length === 0 && (
          <EmptyState title="No cards found" subtitle="This set didn't return any cards." />
        )}
    </ScreenContainer>
  );
}
