import React, { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { CardCameraCapture } from "@/components/CardCameraCapture";
import { useScanSession } from "@/state/ScanSessionContext";
import { useTheme } from "@/theme";

export default function ScanFrontScreen() {
  const theme = useTheme();
  const { setFrontUri, setBackUri, setResult } = useScanSession();

  useFocusEffect(
    useCallback(() => {
      // Starting a fresh scan whenever this tab regains focus keeps stale
      // photos/results from a previous session out of the flow.
      setFrontUri(null);
      setBackUri(null);
      setResult(null);
    }, [setFrontUri, setBackUri, setResult])
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <CardCameraCapture
        side="front"
        title="Step 1 of 2: Scan the front"
        subtitle="Place the card on a flat surface and fill the frame."
        onConfirmed={(uri) => {
          setFrontUri(uri);
          router.push("/scan/back");
        }}
      />
    </View>
  );
}
