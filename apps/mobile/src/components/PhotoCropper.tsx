import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, PanResponderInstance, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { Button } from "@/components/Button";

const MIN_BOX = 60;
const HANDLE_SIZE = 26;
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

type Box = { x: number; y: number; w: number; h: number };
type Corner = "tl" | "tr" | "bl" | "br";

function clampMove(b: Box, dw: number, dh: number): Box {
  const x = Math.min(Math.max(b.x, 0), dw - b.w);
  const y = Math.min(Math.max(b.y, 0), dh - b.h);
  return { ...b, x, y };
}

function resizeCorner(start: Box, corner: Corner, dx: number, dy: number, dw: number, dh: number): Box {
  switch (corner) {
    case "tl": {
      const right = start.x + start.w;
      const bottom = start.y + start.h;
      const x = Math.min(Math.max(start.x + dx, 0), right - MIN_BOX);
      const y = Math.min(Math.max(start.y + dy, 0), bottom - MIN_BOX);
      return { x, y, w: right - x, h: bottom - y };
    }
    case "tr": {
      const left = start.x;
      const bottom = start.y + start.h;
      const right = Math.min(Math.max(start.x + start.w + dx, left + MIN_BOX), dw);
      const y = Math.min(Math.max(start.y + dy, 0), bottom - MIN_BOX);
      return { x: left, y, w: right - left, h: bottom - y };
    }
    case "bl": {
      const right = start.x + start.w;
      const top = start.y;
      const x = Math.min(Math.max(start.x + dx, 0), right - MIN_BOX);
      const bottom = Math.min(Math.max(start.y + start.h + dy, top + MIN_BOX), dh);
      return { x, y: top, w: right - x, h: bottom - top };
    }
    case "br": {
      const left = start.x;
      const top = start.y;
      const w = Math.min(Math.max(start.w + dx, MIN_BOX), dw - left);
      const h = Math.min(Math.max(start.h + dy, MIN_BOX), dh - top);
      return { x: left, y: top, w, h };
    }
  }
}

export function PhotoCropper({
  uri,
  onCancel,
  onCropped,
}: {
  uri: string;
  onCancel: () => void;
  onCropped: (uri: string) => void;
}) {
  const theme = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);

  // Refs mirror the latest state so the PanResponder callbacks below (created
  // once, not on every render) always read live values instead of closing
  // over whatever `box`/`displaySize` happened to be at creation time.
  const boxRef = useRef<Box | null>(null);
  const displaySizeRef = useRef<{ w: number; h: number } | null>(null);
  const boxStartRef = useRef<Box | null>(null);
  useEffect(() => {
    boxRef.current = box;
  }, [box]);
  useEffect(() => {
    displaySizeRef.current = displaySize;
  }, [displaySize]);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled) return;
        const maxW = screenWidth - spacing.lg * 2;
        const maxH = screenHeight * 0.55;
        const scale = Math.min(maxW / w, maxH / h);
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);
        const inset = 0.08;
        setNatural({ w, h });
        setDisplaySize({ w: dw, h: dh });
        setBox({ x: dw * inset, y: dh * inset, w: dw * (1 - inset * 2), h: dh * (1 - inset * 2) });
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const moveResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          boxStartRef.current = boxRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const start = boxStartRef.current;
          const display = displaySizeRef.current;
          if (!start || !display) return;
          const next = clampMove({ ...start, x: start.x + gesture.dx, y: start.y + gesture.dy }, display.w, display.h);
          boxRef.current = next;
          setBox(next);
        },
      }),
    []
  );

  const cornerResponders: Record<Corner, PanResponderInstance> = useMemo(() => {
    const entries = CORNERS.map((corner) => {
      const responder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          boxStartRef.current = boxRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const start = boxStartRef.current;
          const display = displaySizeRef.current;
          if (!start || !display) return;
          const next = resizeCorner(start, corner, gesture.dx, gesture.dy, display.w, display.h);
          boxRef.current = next;
          setBox(next);
        },
      });
      return [corner, responder] as const;
    });
    return Object.fromEntries(entries) as Record<Corner, PanResponderInstance>;
  }, []);

  const confirmCrop = async () => {
    if (!box || !displaySize || !natural) return;
    setBusy(true);
    try {
      const scaleX = natural.w / displaySize.w;
      const scaleY = natural.h / displaySize.h;
      const result = await manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: Math.round(box.x * scaleX),
              originY: Math.round(box.y * scaleY),
              width: Math.round(box.w * scaleX),
              height: Math.round(box.h * scaleY),
            },
          },
        ],
        { compress: 0.92, format: SaveFormat.JPEG }
      );
      onCropped(result.uri);
    } finally {
      setBusy(false);
    }
  };

  if (!displaySize || !box) {
    return <View style={[styles.center, { backgroundColor: theme.background }]} />;
  }

  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Text style={[typography.h3, { color: theme.textPrimary, textAlign: "center" }]}>Crop Photo</Text>
      <Text style={[typography.bodySm, { color: theme.textSecondary, textAlign: "center", marginTop: 2, marginBottom: spacing.md }]}>
        Drag the corners so the card fills more of the frame
      </Text>

      <View style={{ width: displaySize.w, height: displaySize.h }}>
        <Image source={{ uri }} style={{ width: displaySize.w, height: displaySize.h }} resizeMode="stretch" />

        {/* Dim everything outside the crop box */}
        <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, width: displaySize.w, height: box.y }]} />
        <View
          pointerEvents="none"
          style={[styles.dim, { top: box.y + box.h, left: 0, width: displaySize.w, height: displaySize.h - (box.y + box.h) }]}
        />
        <View pointerEvents="none" style={[styles.dim, { top: box.y, left: 0, width: box.x, height: box.h }]} />
        <View
          pointerEvents="none"
          style={[styles.dim, { top: box.y, left: box.x + box.w, width: displaySize.w - (box.x + box.w), height: box.h }]}
        />

        {/* Purely visual border — the interactive move hit-area below is a
            separate, non-nested sibling so it can't intercept touches meant
            for the corner handles (nesting both under one View caused the
            handle's mousedown to bubble up and get stolen by the parent's
            own responder on web). */}
        <View
          pointerEvents="none"
          style={[styles.cropBoxBorder, { left: box.x, top: box.y, width: box.w, height: box.h, borderColor: theme.accent }]}
        />
        <View
          testID="crop-box"
          style={[styles.cropBox, { left: box.x, top: box.y, width: box.w, height: box.h }]}
          {...moveResponder.panHandlers}
        />

        {CORNERS.map((corner) => (
          <View
            key={corner}
            testID={`crop-handle-${corner}`}
            {...cornerResponders[corner].panHandlers}
            style={[
              styles.handle,
              corner === "tl" && { left: box.x - HANDLE_SIZE / 2, top: box.y - HANDLE_SIZE / 2 },
              corner === "tr" && { left: box.x + box.w - HANDLE_SIZE / 2, top: box.y - HANDLE_SIZE / 2 },
              corner === "bl" && { left: box.x - HANDLE_SIZE / 2, top: box.y + box.h - HANDLE_SIZE / 2 },
              corner === "br" && { left: box.x + box.w - HANDLE_SIZE / 2, top: box.y + box.h - HANDLE_SIZE / 2 },
              { backgroundColor: theme.accent },
            ]}
          />
        ))}
      </View>

      <View style={{ marginTop: spacing.lg, gap: spacing.sm, width: "100%" }}>
        <Button label="Use This Crop" size="lg" fullWidth onPress={confirmCrop} loading={busy} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropBoxBorder: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: radius.sm,
  },
  cropBox: {
    position: "absolute",
  },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 2,
    borderColor: "#fff",
  },
});
