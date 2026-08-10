import React, { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { GradeBadge, gradeLabel } from "@/components/GradeBadge";
import { SubgradeBar } from "@/components/SubgradeBar";
import { DefectOverlay } from "@/components/DefectOverlay";
import { PriceSourceRow } from "@/components/PriceSourceRow";
import { Pill } from "@/components/Pill";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { LineChart } from "@/components/charts/LineChart";
import { ChevronRightIcon } from "@/components/icons";
import { useTheme } from "@/theme";
import { spacing, radius } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { getCollectionItem, patchCollectionItem, deleteCollectionItem } from "@/api/collection";
import { imageUrl } from "@/api/client";
import { useScanSession } from "@/state/ScanSessionContext";

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { setCollectionItemId, reset } = useScanSession();
  const [showFront, setShowFront] = useState(true);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [purchasePriceDraft, setPurchasePriceDraft] = useState("");
  const [purchaseDateDraft, setPurchaseDateDraft] = useState("");

  const query = useQuery({ queryKey: ["collection-item", id], queryFn: () => getCollectionItem(id) });

  const patchMutation = useMutation({
    mutationFn: (payload: Parameters<typeof patchCollectionItem>[1]) => patchCollectionItem(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection-item", id] });
      queryClient.invalidateQueries({ queryKey: ["collection"] });
      setEditingNotes(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCollectionItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      router.replace("/(tabs)/collection");
    },
  });

  if (query.isLoading || !query.data) {
    return (
      <ScreenContainer>
        <Text style={[typography.body, { color: theme.textSecondary }]}>Loading…</Text>
      </ScreenContainer>
    );
  }

  const { item, scanHistory } = query.data;
  const grade = item.latestGrade;
  const pricing = item.latestPricing;

  const startEditingNotes = () => {
    setNotesDraft(item.notes ?? "");
    setPurchasePriceDraft(item.purchasePrice ? String(item.purchasePrice) : "");
    setPurchaseDateDraft(item.purchaseDate ? item.purchaseDate.slice(0, 10) : "");
    setEditingNotes(true);
  };

  const onRescan = () => {
    reset();
    setCollectionItemId(id);
    router.push("/(tabs)/scan");
  };

  const onDelete = () => {
    Alert.alert("Remove card?", `This will remove ${item.card.name || "this card"} from your collection.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  };

  return (
    <ScreenContainer>
      <Pressable onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <ChevronRightIcon color={theme.textSecondary} />
        </View>
        <Text style={[typography.body, { color: theme.textSecondary, marginLeft: 4 }]}>Back</Text>
      </Pressable>

      <Pressable onPress={() => setShowFront((v) => !v)}>
        <Image
          source={{ uri: imageUrl(showFront ? item.frontImageUrl : item.backImageUrl) }}
          style={{ width: "100%", aspectRatio: 2.5 / 3.5, borderRadius: radius.xl, backgroundColor: theme.backgroundAlt }}
          resizeMode="cover"
        />
      </Pressable>
      <Text style={[typography.caption, { color: theme.textMuted, textAlign: "center", marginTop: spacing.xs }]}>
        Tap image to flip {showFront ? "to back" : "to front"}
      </Text>

      <Text style={[typography.h1, { color: theme.textPrimary, marginTop: spacing.lg }]}>{item.card.name || "Unidentified card"}</Text>
      <Text style={[typography.body, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
        {item.card.set} {item.card.cardNumber ? `#${item.card.cardNumber}` : ""}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.xxs, flexWrap: "wrap", marginBottom: spacing.lg }}>
        <Pill label={item.condition} tone={item.condition === "Graded" ? "primary" : "neutral"} />
        {item.gradingCompany ? <Pill label={`${item.gradingCompany}${item.certNumber ? ` #${item.certNumber}` : ""}`} tone="accent" /> : null}
        {item.card.rarity ? <Pill label={item.card.rarity} /> : null}
        <Pill label={item.card.language} />
        <Pill label={item.card.holoType} />
      </View>

      {grade && (
        <>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <GradeBadge grade={grade.aiOverallGrade} />
              <View style={{ marginLeft: spacing.md, flex: 1 }}>
                <Text style={[typography.h3, { color: theme.textPrimary }]}>AI Grade: {Math.round(grade.aiOverallGrade)}</Text>
                <Text style={[typography.bodySm, { color: theme.textSecondary }]}>{gradeLabel(grade.aiOverallGrade)}</Text>
              </View>
              {grade.confidence ? (
                <Pill
                  label={`${grade.confidence} confidence`}
                  tone={grade.confidence === "High" ? "success" : grade.confidence === "Medium" ? "primary" : "warning"}
                />
              ) : null}
            </View>
            {grade.qualifiers && grade.qualifiers.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm }}>
                {grade.qualifiers.map((q) => (
                  <Pill key={q.code} label={`${q.code} · ${q.label}`} tone="warning" />
                ))}
              </View>
            )}
          </Card>
          <Card style={{ marginBottom: spacing.lg }}>
            <SubgradeBar label="Centering" value={grade.subgrades.centering} />
            <SubgradeBar label="Corners" value={grade.subgrades.corners} />
            <SubgradeBar label="Edges" value={grade.subgrades.edges} />
            <SubgradeBar label="Surface" value={grade.subgrades.surface} />
          </Card>

          <SectionHeader title="Defect Map" subtitle="Every flagged defect, numbered on the card and matched to a note below — the specific issues that drove this grade." />
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.bodyLg, { color: theme.textPrimary, marginBottom: spacing.sm, fontWeight: "700" }]}>Front</Text>
            <DefectOverlay imageUri={imageUrl(item.frontImageUrl)} defects={grade.defects} side="front" />
            <Text style={[typography.bodyLg, { color: theme.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "700" }]}>
              Back
            </Text>
            <DefectOverlay imageUri={imageUrl(item.backImageUrl)} defects={grade.defects} side="back" />
          </Card>
        </>
      )}

      {pricing && (
        <>
          <SectionHeader title="Estimated Value" />
          <Card style={{ marginBottom: spacing.sm }}>
            <Text style={[typography.display, { color: theme.textPrimary }]}>
              {pricing.estimatedValue !== null ? `$${pricing.estimatedValue.toFixed(2)}` : "—"}
            </Text>
            {pricing.valuationBasis === "graded" && pricing.gradeUsedForValuation ? (
              <View style={{ marginTop: spacing.xs }}>
                <Pill
                  label={`At AI grade ${pricing.gradeUsedForValuation.grade}${
                    pricing.gradeUsedForValuation.company !== "Generic" ? ` (${pricing.gradeUsedForValuation.company})` : ""
                  }`}
                  tone="accent"
                />
              </View>
            ) : null}
            <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: spacing.xxs }]}>{pricing.valuationNote}</Text>
            {pricing.valuationBasis === "graded" && pricing.rawEstimatedValue !== null && (
              <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.xxs }]}>
                Raw/ungraded market value: ${pricing.rawEstimatedValue.toFixed(2)}
              </Text>
            )}
            {item.purchasePrice ? (
              <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: 2 }]}>Purchased for ${item.purchasePrice.toFixed(2)}</Text>
            ) : null}
          </Card>

          {pricing.gradedPrices.some((g) => g.value !== null) && (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700", marginBottom: spacing.xs }]}>
                Graded Price Comps
              </Text>
              {pricing.gradedPrices
                .filter((g) => g.value !== null)
                .map((g) => (
                  <View key={g.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
                    <Text style={[typography.body, { color: theme.textSecondary }]}>{g.label}</Text>
                    <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>${(g.value as number).toFixed(2)}</Text>
                  </View>
                ))}
            </Card>
          )}

          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700", marginBottom: spacing.xs }]}>Raw Market Sources</Text>
            {pricing.sourcesUsed.map((p) => (
              <PriceSourceRow key={p.source} point={p} />
            ))}
            <Text style={[typography.caption, { color: theme.textMuted, marginTop: spacing.sm }]}>
              Last updated {new Date(pricing.lastUpdated).toLocaleString()}
            </Text>
          </Card>
        </>
      )}

      <SectionHeader title="Grade History" subtitle={`${scanHistory.length} scan${scanHistory.length === 1 ? "" : "s"}`} />
      <Card style={{ marginBottom: spacing.lg }}>
        {scanHistory.length > 1 ? (
          <LineChart data={scanHistory.map((s, i) => ({ label: `#${i + 1}`, value: s.overallGrade }))} height={120} />
        ) : null}
        {scanHistory.map((s, i) => (
          <View key={s.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
            <Text style={[typography.body, { color: theme.textSecondary }]}>
              Scan #{i + 1} — {new Date(s.createdAt).toLocaleDateString()}
            </Text>
            <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>{Math.round(s.overallGrade)}</Text>
          </View>
        ))}
      </Card>

      <Button label="Rescan This Card" onPress={onRescan} style={{ marginBottom: spacing.lg }} />

      <SectionHeader title="Notes & Purchase Info" actionLabel={editingNotes ? undefined : "Edit"} onAction={editingNotes ? undefined : startEditingNotes} />
      <Card style={{ marginBottom: spacing.lg }}>
        {editingNotes ? (
          <>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Purchase Price ($)" value={purchasePriceDraft} onChangeText={setPurchasePriceDraft} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Purchase Date" value={purchaseDateDraft} onChangeText={setPurchaseDateDraft} placeholder="YYYY-MM-DD" />
              </View>
            </View>
            <TextField label="Notes" value={notesDraft} onChangeText={setNotesDraft} multiline numberOfLines={3} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditingNotes(false)} style={{ flex: 1 }} />
              <Button
                label="Save"
                loading={patchMutation.isPending}
                onPress={() =>
                  patchMutation.mutate({
                    notes: notesDraft || null,
                    purchasePrice: purchasePriceDraft ? Number(purchasePriceDraft) : null,
                    purchaseDate: purchaseDateDraft || null,
                  })
                }
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={[typography.body, { color: item.notes ? theme.textPrimary : theme.textMuted }]}>{item.notes || "No notes yet."}</Text>
            {(item.purchasePrice || item.purchaseDate) && (
              <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: spacing.xs }]}>
                {item.purchasePrice ? `Purchased for $${item.purchasePrice.toFixed(2)}` : ""}
                {item.purchaseDate ? ` on ${new Date(item.purchaseDate).toLocaleDateString()}` : ""}
              </Text>
            )}
          </>
        )}
      </Card>

      <Button label="Remove From Collection" variant="destructive" onPress={onDelete} loading={deleteMutation.isPending} />
    </ScreenContainer>
  );
}
