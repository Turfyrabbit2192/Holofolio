import React, { useState } from "react";
import { Image, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { SelectChips } from "@/components/SelectChips";
import { Button } from "@/components/Button";
import { AlertIcon, SearchIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spacing, radius } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useScanSession } from "@/state/ScanSessionContext";
import { imageUrl } from "@/api/client";
import { searchCards, CardSearchResult } from "@/api/cards";
import type { CardIdentification } from "@pokedex-vault/shared";

const LANGUAGES = ["English", "Japanese", "Korean", "Chinese", "German", "French", "Italian", "Spanish", "Portuguese", "Other"];
const HOLO_TYPES = ["Non-Holo", "Holo", "Reverse Holo", "Cosmos Holo", "Other"];

export default function ReviewScreen() {
  const theme = useTheme();
  const { result, frontUri, backUri, setResult } = useScanSession();
  const [form, setForm] = useState<CardIdentification>(
    result?.identification ?? {
      confident: false,
      confidenceNote: "No scan data found.",
      name: "",
      set: "",
      setId: null,
      cardNumber: "",
      totalInSet: null,
      rarity: "",
      cardType: "",
      language: "English",
      holoType: "Non-Holo",
      variant: null,
      isPromo: false,
      isFirstEditionOrShadowless: false,
      pokemonTcgIoId: null,
      imageUrl: null,
    }
  );
  const [searchOpen, setSearchOpen] = useState(!form.confident);
  const [query, setQuery] = useState(form.name);
  const [searchResults, setSearchResults] = useState<CardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  if (!result) {
    router.replace("/(tabs)/scan");
    return null;
  }

  const update = <K extends keyof CardIdentification>(key: K, value: CardIdentification[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const { results } = await searchCards(query.trim());
      setSearchResults(results);
      if (results.length === 0) setSearchError("No matching cards found. Double-check the spelling or try just the Pokémon name.");
    } catch {
      setSearchError("Card search is unavailable right now. You can still enter the details manually.");
    } finally {
      setSearching(false);
    }
  };

  const applySearchResult = (card: CardSearchResult) => {
    setForm((f) => ({
      ...f,
      confident: true,
      confidenceNote: null,
      name: card.name,
      set: card.set.name,
      setId: card.set.id,
      cardNumber: card.number,
      totalInSet: card.set.total,
      rarity: card.rarity ?? f.rarity,
      cardType: card.supertype,
      pokemonTcgIoId: card.id,
      imageUrl: card.images.large || card.images.small,
    }));
    setSearchOpen(false);
  };

  const canContinue = form.name.trim().length > 0 && form.set.trim().length > 0;

  const onContinue = () => {
    setResult({ ...result, identification: form });
    router.push("/scan/results");
  };

  return (
    <ScreenContainer>
      <Text style={[typography.h1, { color: theme.textPrimary }]}>Confirm your card</Text>
      <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.lg }]}>
        Step 4 of 8 — review what our AI found and fix anything that's wrong.
      </Text>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg }}>
        {frontUri ? <Image source={{ uri: frontUri }} style={{ flex: 1, aspectRatio: 2.5 / 3.5, borderRadius: radius.lg }} /> : null}
        {backUri ? <Image source={{ uri: backUri }} style={{ flex: 1, aspectRatio: 2.5 / 3.5, borderRadius: radius.lg }} /> : null}
      </View>

      {!form.confident && (
        <Card style={{ backgroundColor: theme.warningSoft, borderColor: theme.warning, marginBottom: spacing.lg, flexDirection: "row" }}>
          <AlertIcon color={theme.warning} />
          <Text style={[typography.bodySm, { color: theme.textPrimary, marginLeft: spacing.sm, flex: 1 }]}>
            We're not completely confident about this identification.{form.confidenceNote ? ` ${form.confidenceNote}` : ""} Please verify the
            card information below.
          </Text>
        </Card>
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <Button
          label={searchOpen ? "Hide card search" : "Search Card Database"}
          variant="secondary"
          icon={<SearchIcon color={theme.primary} size={16} />}
          onPress={() => setSearchOpen((v) => !v)}
        />
        {searchOpen && (
          <View style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <TextField placeholder="e.g. Charizard" value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" />
              </View>
              <Button label="Search" onPress={runSearch} loading={searching} />
            </View>
            {searchError ? <Text style={[typography.bodySm, { color: theme.textMuted }]}>{searchError}</Text> : null}
            {searchResults.map((card) => (
              <Button
                key={card.id}
                variant="ghost"
                label={`${card.name} — ${card.set.name} #${card.number}`}
                onPress={() => applySearchResult(card)}
                style={{ justifyContent: "flex-start", marginBottom: spacing.xxs }}
              />
            ))}
          </View>
        )}
      </Card>

      <TextField label="Pokémon Name" value={form.name} onChangeText={(v) => update("name", v)} placeholder="Charizard" />
      <TextField label="Set" value={form.set} onChangeText={(v) => update("set", v)} placeholder="Base Set" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="Card Number" value={form.cardNumber} onChangeText={(v) => update("cardNumber", v)} placeholder="4" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Total in Set" value={form.totalInSet ?? ""} onChangeText={(v) => update("totalInSet", v || null)} placeholder="102" />
        </View>
      </View>
      <TextField label="Rarity" value={form.rarity} onChangeText={(v) => update("rarity", v)} placeholder="Rare Holo" />
      <TextField label="Card Type" value={form.cardType} onChangeText={(v) => update("cardType", v)} placeholder="Pokémon — Fire" />

      <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Language</Text>
      <View style={{ marginBottom: spacing.md }}>
        <SelectChips options={LANGUAGES} value={form.language} onChange={(v) => update("language", v as CardIdentification["language"])} />
      </View>

      <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Holo Type</Text>
      <View style={{ marginBottom: spacing.md }}>
        <SelectChips options={HOLO_TYPES} value={form.holoType} onChange={(v) => update("holoType", v as CardIdentification["holoType"])} />
      </View>

      <TextField
        label="Variant (optional)"
        value={form.variant ?? ""}
        onChangeText={(v) => update("variant", v || null)}
        placeholder="Alternate Art, Full Art…"
      />

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
          <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>Promo card</Text>
          <Switch value={form.isPromo} onValueChange={(v) => update("isPromo", v)} trackColor={{ true: theme.primary }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[typography.bodyLg, { color: theme.textPrimary }]}>1st Edition / Shadowless</Text>
          <Switch value={form.isFirstEditionOrShadowless} onValueChange={(v) => update("isFirstEditionOrShadowless", v)} trackColor={{ true: theme.primary }} />
        </View>
      </Card>

      <Button label="Continue to Grading & Pricing" size="lg" fullWidth disabled={!canContinue} onPress={onContinue} />
    </ScreenContainer>
  );
}
