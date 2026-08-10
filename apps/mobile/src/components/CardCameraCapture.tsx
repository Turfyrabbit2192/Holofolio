import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Accelerometer } from "expo-sensors";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useTheme } from "@/theme";
import { radius, spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { Button } from "@/components/Button";
import { AlertIcon, CameraIcon, CheckIcon } from "@/components/icons";
import { PhotoCropper } from "@/components/PhotoCropper";
import { checkImageQuality } from "@/api/scan";
import type { ImageQualityReport } from "@pokedex-vault/shared";

type Stage = "camera" | "cropping" | "checking" | "preview";

/** Polls a live ref until it flips true or the timeout elapses, whichever comes first. */
function waitForSteady(steadyRef: React.MutableRefObject<boolean>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (steadyRef.current || Date.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(check, 60);
    };
    check();
  });
}

export function CardCameraCapture({
  side,
  title,
  subtitle,
  onConfirmed,
}: {
  side: "front" | "back";
  title: string;
  subtitle: string;
  onConfirmed: (uri: string) => void;
}) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [stage, setStage] = useState<Stage>("camera");
  const [rawUri, setRawUri] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [quality, setQuality] = useState<ImageQualityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [levelAligned, setLevelAligned] = useState(true);
  const levelAlignedRef = useRef(true);
  const [steady, setSteady] = useState(true);
  const steadyRef = useRef(true);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);

  // Tracks the phone's tilt via the accelerometer so the corner dots slide
  // out of place when the camera isn't held flat/level over the card, and
  // settle back onto the frame corners (turning green) once it is. The same
  // stream also tracks hand-shake: the frame-to-frame change in acceleration
  // (jerk) is a good proxy for "is this photo about to come out blurry" —
  // motion at the instant of capture is the single biggest cause of blurry
  // phone photos, more so than focus. Device-motion sensors are meaningless
  // on web (no phone to tilt), and expo-sensors' web shim throws on
  // addListener rather than no-op'ing, so this is native-only.
  useEffect(() => {
    if (stage !== "camera" || Platform.OS === "web") return;
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (!available || cancelled) return;
        Accelerometer.setUpdateInterval(80);
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          const MAX_OFFSET = 26;
          const SENSITIVITY = 70;
          tilt.setValue({
            x: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, x * SENSITIVITY)),
            y: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, -y * SENSITIVITY)),
          });

          const isLevel = Math.abs(x) < 0.06 && Math.abs(y) < 0.06;
          if (isLevel !== levelAlignedRef.current) {
            levelAlignedRef.current = isLevel;
            setLevelAligned(isLevel);
          }

          const last = lastAccelRef.current;
          lastAccelRef.current = { x, y, z };
          if (last) {
            const jerk = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z);
            const isSteady = jerk < 0.05;
            if (isSteady !== steadyRef.current) {
              steadyRef.current = isSteady;
              setSteady(isSteady);
            }
          }
        });
      })
      .catch(() => {
        // Sensor unsupported on this device/platform — leave dots static.
      });

    return () => {
      cancelled = true;
      subscription?.remove();
      tilt.setValue({ x: 0, y: 0 });
      levelAlignedRef.current = true;
      setLevelAligned(true);
      steadyRef.current = true;
      setSteady(true);
      lastAccelRef.current = null;
    };
  }, [stage]);

  const runQualityCheck = async (uri: string) => {
    setPhotoUri(uri);
    setStage("checking");
    try {
      const report = await checkImageQuality(uri, side);
      setQuality(report);
    } catch {
      // Don't claim we verified the photo when the check itself failed (a
      // network hiccup, the server being unreachable, etc.) — that previously
      // showed a false "Looks good" and let people sail through both photos
      // only to hit a confusing failure later at the real analyze step, with
      // no way to tell what actually went wrong. Flag it honestly instead and
      // let "Retake" / "Use This Photo Anyway" make the call.
      setQuality({
        passed: false,
        issues: [
          {
            type: "check_unavailable",
            message: "We couldn't verify photo quality — check your connection and try again, or continue if you're confident the photo is good.",
            severity: "reject",
          },
        ],
        metrics: { sharpnessScore: 0, brightnessMean: 0, glareRatio: 0, detectedQuad: null },
      });
    } finally {
      setStage("preview");
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      // Give hand-shake a moment to settle before actually capturing — this
      // is the single biggest fix for blurry phone photos of a static
      // subject like a card on a table. On native we wait for the
      // accelerometer to report the phone has actually stopped moving (capped
      // so a naturally shaky hand doesn't stall the shutter forever); on web
      // there's no motion sensor to wait on, so just a short fixed pause.
      if (Platform.OS !== "web") {
        await waitForSteady(steadyRef, 900);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        setRawUri(photo.uri);
        setStage("cropping");
      }
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      // Photos picked from the library can be HEIC (the default format for
      // photos taken with the iPhone's own Camera app) — the server's image
      // library can't decode that, so re-encode to a real JPEG here, where
      // the OS's native decoder can read HEIC fine, before it ever leaves the device.
      const jpeg = await manipulateAsync(result.assets[0].uri, [], { compress: 0.9, format: SaveFormat.JPEG });
      setRawUri(jpeg.uri);
      setStage("cropping");
    }
  };

  const retake = () => {
    setRawUri(null);
    setPhotoUri(null);
    setQuality(null);
    setStage("camera");
  };

  // Only gate on camera permission while actually on the camera stage — once
  // the user has picked/taken a photo and moved on to cropping/checking/
  // preview, permission status is irrelevant and must not block those
  // screens (previously this ran unconditionally, so picking a photo from
  // the library without camera permission granted left the app stuck
  // showing this screen forever no matter how many times a photo was picked).
  if (stage === "camera" && !permission) {
    return <View style={styles.center} />;
  }

  if (stage === "camera" && !permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={[typography.h3, { color: theme.textPrimary, textAlign: "center", marginBottom: spacing.sm }]}>
          Camera access needed
        </Text>
        <Text style={[typography.body, { color: theme.textSecondary, textAlign: "center", marginBottom: spacing.lg }]}>
          Holofolio needs your camera to scan cards.
        </Text>
        <Button label="Grant Camera Access" onPress={requestPermission} />
        <Button label="Use Photo From Camera Roll" variant="ghost" onPress={pickFromLibrary} style={{ marginTop: spacing.sm }} />
      </View>
    );
  }

  if (stage === "camera") {
    return (
      <View style={styles.flex}>
        <CameraView ref={cameraRef} style={styles.flex} facing="back" autofocus="on">
          <View style={styles.overlay}>
            <View style={styles.guideFrameWrap}>
              <View style={styles.guideFrame} />
              <Animated.View style={[StyleSheet.absoluteFillObject, { transform: tilt.getTranslateTransform() }]}>
                <View style={[styles.cornerDot, styles.dotTL, (!levelAligned || !steady) && styles.cornerDotOff]} />
                <View style={[styles.cornerDot, styles.dotTR, (!levelAligned || !steady) && styles.cornerDotOff]} />
                <View style={[styles.cornerDot, styles.dotBL, (!levelAligned || !steady) && styles.cornerDotOff]} />
                <View style={[styles.cornerDot, styles.dotBR, (!levelAligned || !steady) && styles.cornerDotOff]} />
              </Animated.View>
            </View>
            <Text style={styles.alignHint}>
              {busy
                ? "Hold steady…"
                : !levelAligned
                ? "Tilting — hold the phone flat over the card"
                : !steady
                ? "Movement detected — hold steady"
                : "Level — line up the corners and shoot"}
            </Text>
          </View>
        </CameraView>
        <View style={[styles.captionBox, { backgroundColor: theme.surface }]}>
          <Text style={[typography.h3, { color: theme.textPrimary }]}>{title}</Text>
          <Text style={[typography.bodySm, { color: theme.textSecondary, marginTop: 2 }]}>{subtitle}</Text>
          <View style={styles.captureRow}>
            <Pressable onPress={takePicture} disabled={busy} style={[styles.shutter, { borderColor: theme.accent }]}>
              {busy ? <ActivityIndicator color={theme.accent} /> : <View style={[styles.shutterInner, { backgroundColor: theme.accent }]} />}
            </Pressable>
          </View>
          <Button label="Use Photo From Camera Roll" variant="ghost" onPress={pickFromLibrary} />
        </View>
      </View>
    );
  }

  if (stage === "cropping" && rawUri) {
    return (
      <PhotoCropper
        uri={rawUri}
        onCancel={() => {
          setRawUri(null);
          setStage("camera");
        }}
        onCropped={(uri) => {
          setRawUri(null);
          runQualityCheck(uri);
        }}
      />
    );
  }

  if (stage === "checking") {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="contain" /> : null}
        <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.lg }} />
        <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.sm }]}>Checking photo quality…</Text>
      </View>
    );
  }

  const passed = quality?.passed ?? true;

  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="contain" /> : null}

      <View style={styles.resultBox}>
        <View style={styles.resultHeader}>
          {passed ? <CheckIcon color={theme.success} /> : <AlertIcon color={theme.accent} />}
          <Text style={[typography.h3, { color: passed ? theme.success : theme.accent, marginLeft: spacing.xs }]}>
            {passed ? "Looks good" : "Retake recommended"}
          </Text>
        </View>
        {quality?.issues.map((issue, i) => (
          <Text key={i} style={[typography.bodySm, { color: theme.textSecondary, marginTop: 4 }]}>
            • {issue.message}
          </Text>
        ))}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {passed ? (
            <Button label="Continue" size="lg" fullWidth onPress={() => photoUri && onConfirmed(photoUri)} />
          ) : (
            <>
              <Button label="Retake Photo" size="lg" fullWidth onPress={retake} icon={<CameraIcon color="#fff" size={18} />} />
              <Button label="Use This Photo Anyway" variant="ghost" onPress={() => photoUri && onConfirmed(photoUri)} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  guideFrameWrap: { width: "72%", aspectRatio: 2.5 / 3.5 },
  guideFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: radius.lg,
    borderStyle: "dashed",
  },
  cornerDot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dotTL: { top: -8, left: -8 },
  dotTR: { top: -8, right: -8 },
  dotBL: { bottom: -8, left: -8 },
  dotBR: { bottom: -8, right: -8 },
  cornerDotOff: { backgroundColor: "#f59e0b" },
  alignHint: {
    marginTop: spacing.md,
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  captionBox: {
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  captureRow: { alignItems: "center", marginVertical: spacing.md },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  previewImage: { width: "100%", height: 320, borderRadius: radius.lg },
  resultBox: { width: "100%", marginTop: spacing.lg },
  resultHeader: { flexDirection: "row", alignItems: "center" },
});
