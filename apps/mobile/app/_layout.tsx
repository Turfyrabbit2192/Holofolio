import "react-native-gesture-handler";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { AuthProvider } from "@/state/AuthContext";
import { ScanSessionProvider } from "@/state/ScanSessionContext";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ScanSessionProvider>
              <StatusBar style={scheme === "dark" ? "light" : "dark"} />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="login" options={{ presentation: "card" }} />
                <Stack.Screen name="register" options={{ presentation: "card" }} />
                <Stack.Screen name="scan/back" options={{ presentation: "card", animation: "slide_from_right" }} />
                <Stack.Screen name="scan/processing" options={{ presentation: "card", gestureEnabled: false }} />
                <Stack.Screen name="scan/review" options={{ presentation: "card" }} />
                <Stack.Screen name="scan/results" options={{ presentation: "card", gestureEnabled: false }} />
                <Stack.Screen name="collection/[id]" options={{ presentation: "card" }} />
                <Stack.Screen name="dashboard" options={{ presentation: "card" }} />
              </Stack>
            </ScanSessionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
