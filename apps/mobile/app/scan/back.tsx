import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CardCameraCapture } from "@/components/CardCameraCapture";
import { useScanSession } from "@/state/ScanSessionContext";
import { useTheme } from "@/theme";

export default function ScanBackScreen() {
  const theme = useTheme();
  const { setBackUri } = useScanSession();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <CardCameraCapture
        side="back"
        title="Step 2 of 2: Scan the back"
        subtitle="Flip the card over and keep it flat and centered."
        onConfirmed={(uri) => {
          setBackUri(uri);
          router.push("/scan/processing");
        }}
      />
    </View>
  );
}
