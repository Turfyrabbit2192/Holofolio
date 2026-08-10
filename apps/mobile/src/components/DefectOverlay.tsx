import React, { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import Svg, { Rect } from "react-native-svg";
import type { DefectFinding, CardZone, DefectCategory } from "@pokedex-vault/shared";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const SEVERITY_COLOR: Record<DefectFinding["severity"], string> = {
  minor: "#E8A93A",
  moderate: "#E62E38",
  major: "#A11620",
};

const SEVERITY_ORDER: Record<DefectFinding["severity"], number> = { major: 0, moderate: 1, minor: 2 };

const ZONE_LABEL: Record<CardZone, string> = {
  corner_top_left: "Top-Left Corner",
  corner_top_right: "Top-Right Corner",
  corner_bottom_left: "Bottom-Left Corner",
  corner_bottom_right: "Bottom-Right Corner",
  edge_top: "Top Edge",
  edge_bottom: "Bottom Edge",
  edge_left: "Left Edge",
  edge_right: "Right Edge",
  surface_center: "Surface (Center)",
  surface_general: "Surface",
};

const CATEGORY_LABEL: Record<DefectCategory, string> = {
  scratch: "Scratch",
  whitening: "Whitening",
  surface_mark: "Surface Mark",
  print_line: "Print Line",
  holo_scratch: "Holo Scratch",
  stain: "Stain",
  dent: "Dent",
  crease: "Crease",
  scuffing: "Scuffing",
  print_imperfection: "Print Imperfection",
  edge_wear: "Edge Wear",
  color_issue: "Color Issue",
  alignment_issue: "Print Alignment",
  corner_wear: "Corner Wear",
  chipping: "Chipping",
  layering: "Layering",
  bend: "Bend",
};

/**
 * A DING-style defect map (named after TAG Grading's "Defects Identified of
 * Notable Grade Significance" reports): every flagged defect gets a
 * numbered pin on the card image, and the same number keys into a legend
 * below listing its zone, category, and description — rather than an
 * unlabeled highlight box the user has to match up by eye.
 */
export function DefectOverlay({ imageUri, defects, side }: { imageUri: string; defects: DefectFinding[]; side: "front" | "back" }) {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Mirrors TAG's DIG report "Surface Defect Transparency Slider" — drag
  // toward "Clean Photo" to fade the map out and inspect the raw photo
  // underneath, or toward "Full Map" to see every pin at full strength,
  // instead of only ever having the overlay permanently on.
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const relevant = [...defects.filter((d) => d.side === side && d.boundingBox)].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (a.boundingBox?.y ?? 0) - (b.boundingBox?.y ?? 0);
  });

  const counts = { major: 0, moderate: 0, minor: 0 };
  for (const d of relevant) counts[d.severity]++;

  const onLayout = (e: LayoutChangeEvent) => {
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  };

  return (
    <View>
      <View style={styles.summaryRow}>
        <Text style={[typography.bodySm, { color: theme.textSecondary, flex: 1 }]}>
          {relevant.length === 0
            ? "No defects flagged on this side."
            : `${relevant.length} defect${relevant.length === 1 ? "" : "s"} found` +
              (counts.major ? ` · ${counts.major} major` : "") +
              (counts.moderate ? ` · ${counts.moderate} moderate` : "") +
              (counts.minor ? ` · ${counts.minor} minor` : "")}
        </Text>
      </View>

      <View style={[styles.imageWrap, { borderColor: theme.border }]} onLayout={onLayout}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        {size.width > 0 && (
          <View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
              {relevant.map((d, i) => {
                const box = d.boundingBox!;
                return (
                  <Rect
                    key={i}
                    x={box.x * size.width}
                    y={box.y * size.height}
                    width={Math.max(box.width * size.width, 6)}
                    height={Math.max(box.height * size.height, 6)}
                    stroke={SEVERITY_COLOR[d.severity]}
                    strokeWidth={2}
                    fill={SEVERITY_COLOR[d.severity]}
                    fillOpacity={0.15}
                    rx={3}
                  />
                );
              })}
            </Svg>
            {relevant.map((d, i) => {
              const box = d.boundingBox!;
              const cx = (box.x + box.width / 2) * size.width;
              const cy = (box.y + box.height / 2) * size.height;
              const PIN = 20;
              return (
                <View
                  key={i}
                  style={[
                    styles.pin,
                    {
                      left: Math.min(Math.max(cx - PIN / 2, 0), size.width - PIN),
                      top: Math.min(Math.max(cy - PIN / 2, 0), size.height - PIN),
                      width: PIN,
                      height: PIN,
                      borderRadius: PIN / 2,
                      backgroundColor: SEVERITY_COLOR[d.severity],
                    },
                  ]}
                >
                  <Text style={styles.pinText}>{i + 1}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {relevant.length > 0 && (
        <View style={styles.sliderRow}>
          <Text style={[typography.caption, { color: theme.textMuted }]}>Clean Photo</Text>
          <Slider
            style={styles.slider}
            value={overlayOpacity}
            onValueChange={setOverlayOpacity}
            minimumValue={0}
            maximumValue={1}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
          />
          <Text style={[typography.caption, { color: theme.textMuted }]}>Full Map</Text>
        </View>
      )}

      {relevant.map((d, i) => (
        <View key={i} style={styles.findingRow}>
          <View style={[styles.badge, { backgroundColor: SEVERITY_COLOR[d.severity] }]}>
            <Text style={styles.badgeText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySm, { color: theme.textPrimary, fontWeight: "700" }]}>
              {ZONE_LABEL[d.zone]} · {CATEGORY_LABEL[d.category]}
              <Text style={{ color: SEVERITY_COLOR[d.severity], fontWeight: "700" }}> ({d.severity})</Text>
            </Text>
            <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: 1 }]}>{d.description}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { marginBottom: spacing.xs },
  imageWrap: {
    aspectRatio: 2.5 / 3.5,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  slider: { flex: 1, height: 32 },
  pin: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  pinText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  findingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: spacing.sm },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
