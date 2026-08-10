import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/state/AuthContext";
import { useTheme } from "@/theme";
import { radius } from "@/theme/spacing";
import { CameraIcon, CollectionIcon, HomeIcon, PriceTagIcon, ProfileIcon } from "@/components/icons";

function ScanTabButton({ onPress, accessibilityState }: any) {
  const theme = useTheme();
  const focused = accessibilityState?.selected;
  return (
    <Pressable onPress={onPress} style={styles.scanButtonWrap}>
      <View
        style={[
          styles.scanButton,
          {
            backgroundColor: theme.accent,
            borderColor: theme.background,
            shadowColor: theme.accent,
            transform: [{ scale: focused ? 1.04 : 1 }],
          },
        ]}
      >
        <CameraIcon color="#FFFFFF" size={28} />
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!isLoading && !user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "Home", tabBarIcon: ({ color }) => <HomeIcon color={String(color)} /> }}
      />
      <Tabs.Screen
        name="collection"
        options={{ title: "Collection", tabBarIcon: ({ color }) => <CollectionIcon color={String(color)} /> }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "",
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="prices"
        options={{ title: "Prices", tabBarIcon: ({ color }) => <PriceTagIcon color={String(color)} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color }) => <ProfileIcon color={String(color)} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanButtonWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: Platform.OS === "ios" ? -18 : -22,
  },
  scanButton: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
