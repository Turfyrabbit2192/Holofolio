import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { GradeBadge, gradeLabel } from "@/components/GradeBadge";
import { SubgradeBar } from "@/components/SubgradeBar";
import { CompanyGradeRow } from "@/components/CompanyGradeRow";
import { PriceSourceRow } from "@/components/PriceSourceRow";
import { DefectOverlay } from "@/components/DefectOverlay";
import { SelectChips } from "@/components/SelectChips";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Pill } from "@/components/Pill";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useScanSession } from "@/state/ScanSessionContext";
import { createCollectionItem, rescanCollectionItem } from "@/api/collection";
import { ApiError } from "@/api/client";
import type { GradingCompany } from "@pokedex-vault/shared";

const CONDITIONS = ["Raw", "Graded"] as const;
const COMPANIES: GradingCompany[] = ["PSA", "TAG", "BGS", "CGC"];

export default function ResultsScreen() {
  const theme = useTheme();
  const { result, frontUri, backUri, collectionItemId, reset } = useScanSession();

  const [condition, setCondition] = useState<"Raw" | "Graded">("Raw");
  const [gradingCompany, setGradingCompany] = useState<GradingCompany>("PSA");
  const [certNumber, setCertNumber] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!result) {
    router.replace("/(tabs)/scan");
    return null;
  }

  const { identification, grading, pricing } = result;

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (collectionItemId) {
        await rescanCollectionItem(collectionItemId, {
          identification,
          grading,
          pricing,
          frontImageUrl: result.frontImageUrl,
          backImageUrl: result.backImageUrl,
        });
        reset();
        router.replace(`/collection/${collectionItemId}`);
      } else {
        const item = await createCollectionItem({
          identification,
          grading,
          pricing,
          frontImageUrl: result.frontImageUrl,
          backImageUrl: result.backImageUrl,
          condition,
          gradingCompany: condition === "Graded" ? gradingCompany : null,
          certNumber: condition === "Graded" && certNumber ? certNumber : null,
          purchasePrice: purchasePrice ? Number(purchasePrice) : null,
          purchaseDate: purchaseDate || null,
          notes: notes || null,
        });
        reset();
        router.replace(`/collection/${item.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save this card. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={[typography.h1, { color: theme.textPrimary }]}>{identification.name || "Your Card"}</Text>
      <Text style={[typography.body, { color: theme.textSecondary, marginBottom: spacing.lg }]}>
        {identification.set} {identification.cardNumber ? `#${identification.cardNumber}` : ""}
      </Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <GradeBadge grade={grading.aiOverallGrade} />
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={[typography.h3, { color: theme.textPrimary }]}>AI Estimated Grade: {Math.round(grading.aiOverallGrade)}</Text>
            <Text style={[typography.bodySm, { color: theme.textSecondary }]}>{gradeLabel(grading.aiOverallGrade)}</Text>
          </View>
          {grading.confidence ? (
            <Pill
              label={`${grading.confidence} confidence`}
              tone={grading.confidence === "High" ? "success" : grading.confidence === "Medium" ? "primary" : "warning"}
            />
          ) : null}
        </View>
        {grading.confidenceNote ? (
          <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: spacing.sm }]}>{grading.confidenceNote}</Text>
        ) : null}
        {grading.qualifiers && grading.qualifiers.length > 0 && (
          <View style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.xs }}>
              {grading.qualifiers.map((q) => (
                <Pill key={q.code} label={`${q.code} · ${q.label}`} tone="warning" />
              ))}
            </View>
            {grading.qualifiers.map((q) => (
              <Text key={q.code} style={[typography.caption, { color: theme.textMuted, marginTop: 4 }]}>
                {q.note}
              </Text>
            ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Subgrades" />
      <Card style={{ marginBottom: spacing.lg }}>
        <SubgradeBar label="Centering" value={grading.subgrades.centering} />
        <SubgradeBar label="Corners" value={grading.subgrades.corners} />
        <SubgradeBar label="Edges" value={grading.subgrades.edges} />
        <SubgradeBar label="Surface" value={grading.subgrades.surface} />
        {grading.centeringFront && (
          <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.xs }]}>
            Front Centering: {grading.centeringFront.leftRightRatio[0]}/{grading.centeringFront.leftRightRatio[1]} (L/R),{" "}
            {grading.centeringFront.topBottomRatio[0]}/{grading.centeringFront.topBottomRatio[1]} (T/B)
          </Text>
        )}
        {grading.centeringBack && (
          <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: 2 }]}>
            Back Centering: {grading.centeringBack.leftRightRatio[0]}/{grading.centeringBack.leftRightRatio[1]} (L/R),{" "}
            {grading.centeringBack.topBottomRatio[0]}/{grading.centeringBack.topBottomRatio[1]} (T/B)
          </Text>
        )}
      </Card>

      <SectionHeader title="Grading Company Estimates" subtitle={grading.varianceExplanation} />
      <Card style={{ marginBottom: spacing.lg }}>
        {grading.companyEstimates.map((e) => (
          <CompanyGradeRow key={e.company} estimate={e} />
        ))}
      </Card>

      <SectionHeader title="Defect Map" subtitle="Every flagged defect, numbered on the card and matched to a note below — the specific issues that drove this grade." />
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary, marginBottom: spacing.sm, fontWeight: "700" }]}>Front</Text>
        <DefectOverlay imageUri={frontUri ?? result.frontImageUrl} defects={grading.defects} side="front" />
        <Text style={[typography.bodyLg, { color: theme.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "700" }]}>
          Back
        </Text>
        <DefectOverlay imageUri={backUri ?? result.backImageUrl} defects={grading.defects} side="back" />
      </Card>

      <Card style={{ marginBottom: spacing.lg, backgroundColor: theme.backgroundAlt, borderColor: "transparent" }}>
        <Text style={[typography.caption, { color: theme.textMuted }]}>{grading.disclaimer}</Text>
      </Card>

      <SectionHeader title="Estimated Value" />
      <Card style={{ marginBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[typography.display, { color: theme.textPrimary }]}>
            {pricing.estimatedValue !== null ? `$${pricing.estimatedValue.toFixed(2)}` : "—"}
          </Text>
          <Pill
            label={`${pricing.confidence} confidence`}
            tone={pricing.confidence === "High" ? "success" : pricing.confidence === "Medium" ? "primary" : "warning"}
          />
        </View>
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
        <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.xxs }]}>{pricing.confidenceNote}</Text>
        {pricing.valuationBasis === "graded" && pricing.rawEstimatedValue !== null && (
          <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.xxs }]}>
            Raw/ungraded market value: ${pricing.rawEstimatedValue.toFixed(2)}
          </Text>
        )}
        {pricing.marketRangeLow !== null && pricing.marketRangeHigh !== null && (
          <Text style={[typography.bodySm, { color: theme.textMuted, marginTop: spacing.xxs }]}>
            Recent Raw Market Range: ${pricing.marketRangeLow.toFixed(2)}–${pricing.marketRangeHigh.toFixed(2)}
          </Text>
        )}
      </Card>

      {pricing.gradedPrices.some((g) => g.value !== null) && (
        <>
          <SectionHeader title="Graded Price Comps" subtitle="From PriceCharting" />
          <Card style={{ marginBottom: spacing.lg }}>
            {pricing.gradedPrices
              .filter((g) => g.value !== null)
              .map((g) => (
                <View key={g.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
                  <Text style={[typography.body, { color: theme.textSecondary }]}>{g.label}</Text>
                  <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700" }]}>${(g.value as number).toFixed(2)}</Text>
                </View>
              ))}
          </Card>
        </>
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.bodyLg, { color: theme.textPrimary, fontWeight: "700", marginBottom: spacing.xs }]}>
          Raw Market Sources
        </Text>
        {pricing.sourcesUsed.map((p) => (
          <PriceSourceRow key={p.source} point={p} />
        ))}
        <Text style={[typography.caption, { color: theme.textMuted, marginTop: spacing.sm }]}>
          Last updated {new Date(pricing.lastUpdated).toLocaleString()}. {pricing.disclaimer}
        </Text>
      </Card>

      <SectionHeader title={collectionItemId ? "Update This Card" : "Add to My Collection"} />
      <Card style={{ marginBottom: spacing.xl }}>
        {!collectionItemId && (
          <>
            <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Condition</Text>
            <View style={{ marginBottom: spacing.md }}>
              <SelectChips options={[...CONDITIONS]} value={condition} onChange={(v) => setCondition(v as "Raw" | "Graded")} />
            </View>
            {condition === "Graded" && (
              <>
                <Text style={[typography.caption, { color: theme.textSecondary, marginBottom: spacing.xxs }]}>Grading Company</Text>
                <View style={{ marginBottom: spacing.md }}>
                  <SelectChips options={COMPANIES} value={gradingCompany} onChange={(v) => setGradingCompany(v as GradingCompany)} />
                </View>
                <TextField label="Certification Number" value={certNumber} onChangeText={setCertNumber} placeholder="e.g. 12345678" />
              </>
            )}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Purchase Price ($)" value={purchasePrice} onChangeText={setPurchasePrice} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Purchase Date" value={purchaseDate} onChangeText={setPurchaseDate} placeholder="YYYY-MM-DD" />
              </View>
            </View>
            <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Anything worth remembering about this card…" multiline numberOfLines={3} />
          </>
        )}
        {error ? <Text style={[typography.bodySm, { color: theme.accent, marginBottom: spacing.sm }]}>{error}</Text> : null}
        <Button label={collectionItemId ? "Save Updated Scan" : "Add to My Collection"} size="lg" fullWidth loading={saving} onPress={onSave} />
      </Card>
    </ScreenContainer>
  );
}
