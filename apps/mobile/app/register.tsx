import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { useTheme } from "@/theme";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { ScreenContainer } from "@/components/ScreenContainer";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth } from "@/state/AuthContext";
import { ApiError } from "@/api/client";
import { BrandMark } from "@/components/BrandMark";

export default function RegisterScreen() {
  const theme = useTheme();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "center" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: spacing.xl }}>
          <BrandMark />
          <Text style={[typography.h1, { color: theme.textPrimary, marginTop: spacing.xxl }]}>Create your account</Text>
          <Text style={[typography.body, { color: theme.textSecondary, marginTop: spacing.xxs, marginBottom: spacing.xl }]}>
            Start scanning, grading, and tracking your Pokémon card collection.
          </Text>

          <TextField label="Name (optional)" value={displayName} onChangeText={setDisplayName} placeholder="Ash Ketchum" />
          <TextField
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            secureTextEntry
            autoComplete="password-new"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
          />

          {error ? <Text style={[typography.bodySm, { color: theme.accent, marginBottom: spacing.sm }]}>{error}</Text> : null}

          <Button label="Create Account" onPress={onSubmit} loading={loading} fullWidth size="lg" />

          <View style={{ flexDirection: "row", justifyContent: "center", marginTop: spacing.lg, gap: 6 }}>
            <Text style={[typography.body, { color: theme.textSecondary }]}>Already have an account?</Text>
            <Link href="/login">
              <Text style={[typography.body, { color: theme.primary, fontWeight: "700" }]}>Sign in</Text>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
