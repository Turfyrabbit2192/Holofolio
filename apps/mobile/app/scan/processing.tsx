import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useScanSession } from "@/state/ScanSessionContext";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { Button } from "@/components/Button";
import { CheckIcon } from "@/components/icons";
import { analyzeScan, ScanQualityError } from "@/api/scan";
import { ApiError } from "@/api/client";

const STAGES = ["Identifying card…", "Analyzing condition…", "Calculating grades…", "Finding market prices…"];

export default function ProcessingScreen() {
  const theme = useTheme();
  const { frontUri, backUri, setResult, reset } = useScanSession();
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [qualityIssue, setQualityIssue] = useState<{ side: "front" | "back"; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (started.current) return;
    if (!frontUri || !backUri) {
      router.replace("/(tabs)/scan");
      return;
    }
    started.current = true;

    analyzeScan(frontUri, backUri)
      .then((result) => {
        setResult(result);
        router.replace("/scan/review");
      })
      .catch((e) => {
        if (e instanceof ScanQualityError) {
          const badSide = !e.frontQuality.passed ? "front" : "back";
          const report = badSide === "front" ? e.frontQuality : e.backQuality;
          setQualityIssue({ side: badSide, message: report.issues[0]?.message ?? "Image quality was too low to analyze." });
        } else {
          setError(e instanceof ApiError ? e.message : "Something went wrong while analyzing your scan.");
        }
      });
  }, [frontUri, backUri, setResult]);

  if (qualityIssue) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[typography.h2, { color: theme.textPrimary, textAlign: "center" }]}>Let's retake that photo</Text>
        <Text style={[typography.body, { color: theme.textSecondary, textAlign: "center", marginTop: spacing.sm }]}>
          {qualityIssue.message}
        </Text>
        <Button
          label={`Retake ${qualityIssue.side === "front" ? "Front" : "Back"} Photo`}
          size="lg"
          style={{ marginTop: spacing.xl }}
          onPress={() => {
            if (qualityIssue.side === "front") {
              router.replace("/(tabs)/scan");
            } else {
              router.replace("/scan/back");
            }
          }}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[typography.h2, { color: theme.textPrimary, textAlign: "center" }]}>Couldn't complete the scan</Text>
        <Text style={[typography.body, { color: theme.textSecondary, textAlign: "center", marginTop: spacing.sm }]}>{error}</Text>
        <Button
          label="Try Again"
          size="lg"
          style={{ marginTop: spacing.xl }}
          onPress={() => {
            reset();
            router.replace("/(tabs)/scan");
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Text style={[typography.h1, { color: theme.textPrimary, textAlign: "center" }]}>Analyzing your card</Text>
      <View style={{ marginTop: spacing.xxl, width: "100%" }}>
        {STAGES.map((label, i) => {
          const done = i < stageIndex;
          const active = i === stageIndex;
          return (
            <View key={label} style={styles.stageRow}>
              <View
                style={[
                  styles.stageDot,
                  {
                    backgroundColor: done ? theme.success : active ? theme.primary : theme.backgroundAlt,
                    borderColor: done ? theme.success : active ? theme.primary : theme.border,
                  },
                ]}
              >
                {done ? <CheckIcon color="#fff" size={14} /> : null}
              </View>
              <Text
                style={[
                  typography.bodyLg,
                  { color: done || active ? theme.textPrimary : theme.textMuted, marginLeft: spacing.sm, fontWeight: active ? "700" : "400" },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  stageRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  stageDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
