import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Switch, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { saveNearbyAlertsPreference } from "@/services/profile";
import { requestLocationPermission } from "@/services/location";
import { impactMedium } from "@/utils/haptics";

export default function NearbyAlertsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const handleContinue = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    impactMedium();

    // Save preference to server
    const success = await saveNearbyAlertsPreference(alertsEnabled);
    if (!success) {
      setSaving(false);
      savingRef.current = false;
      Alert.alert("Error", "Could not save your preference. Please try again.");
      return;
    }

    useAuthStore.getState().setNearbyAlertsEnabled(alertsEnabled);

    // Request location permission if alerts are enabled
    if (alertsEnabled) {
      const permResult = await requestLocationPermission();
      if (permResult === "blocked") {
        // Permission permanently denied — guide user to Settings
        await saveNearbyAlertsPreference(false);
        useAuthStore.getState().setNearbyAlertsEnabled(false);
        Alert.alert(
          "Location Access Needed",
          "You've previously denied location access. To enable nearby alerts, open Settings and allow location for Wave.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
      } else if (permResult === "denied") {
        // User dismissed or denied (can ask again next time)
        await saveNearbyAlertsPreference(false);
        useAuthStore.getState().setNearbyAlertsEnabled(false);
      }
    }

    setSaving(false);
    savingRef.current = false;
    router.replace("/(main)/radar");
  };

  const handleSkip = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    // Save as disabled
    await saveNearbyAlertsPreference(false);
    useAuthStore.getState().setNearbyAlertsEnabled(false);

    setSaving(false);
    savingRef.current = false;
    router.replace("/(main)/radar");
  };

  return (
    <View
      className="flex-1 bg-echo-bg items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Icon */}
      <View className="w-16 h-16 rounded-full bg-echo-primary/20 items-center justify-center mb-6 border-2 border-echo-primary/40">
        <Ionicons name="location-outline" size={32} color="#6c63ff" />
      </View>

      <Text className="text-2xl font-bold text-white mb-2">
        Never Miss a Connection
      </Text>
      <Text className="text-echo-muted text-sm text-center mb-8 leading-5 px-4">
        Get notified when Wave users are near you so you can wave before they leave.
      </Text>

      {/* How it works */}
      <View className="w-full bg-echo-surface rounded-2xl p-5 mb-8">
        <View className="flex-row items-center mb-4">
          <View className="w-8 h-8 rounded-full bg-echo-primary/20 items-center justify-center mr-3">
            <Text className="text-sm">📍</Text>
          </View>
          <Text className="text-white text-sm flex-1">
            We check your location when you open Wave
          </Text>
        </View>
        <View className="flex-row items-center mb-4">
          <View className="w-8 h-8 rounded-full bg-echo-primary/20 items-center justify-center mr-3">
            <Text className="text-sm">🔔</Text>
          </View>
          <Text className="text-white text-sm flex-1">
            You get a notification when Wave users are nearby
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-echo-primary/20 items-center justify-center mr-3">
            <Text className="text-sm">🔒</Text>
          </View>
          <Text className="text-white text-sm flex-1">
            Your location is never shared with other users
          </Text>
        </View>
      </View>

      {/* Toggle */}
      <View className="w-full bg-echo-surface rounded-2xl p-4 mb-8 flex-row items-center justify-between">
        <View className="flex-1 mr-4">
          <Text className="text-white text-base font-semibold">Nearby Alerts</Text>
          <Text className="text-echo-muted text-xs mt-1">
            Know when Wave users are around you
          </Text>
        </View>
        <Switch
          value={alertsEnabled}
          onValueChange={setAlertsEnabled}
          trackColor={{ false: "#333", true: "#6c63ff" }}
          thumbColor="white"
        />
      </View>

      {/* Continue button */}
      <TouchableOpacity
        onPress={handleContinue}
        disabled={saving}
        className="w-full bg-echo-primary rounded-2xl py-4 items-center justify-center mb-3"
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text className="text-white text-base font-semibold">Continue</Text>
        )}
      </TouchableOpacity>

      {/* Skip */}
      <TouchableOpacity onPress={handleSkip} disabled={saving}>
        <Text className="text-echo-muted text-sm">Skip for now</Text>
      </TouchableOpacity>

      <Text className="text-echo-muted text-xs text-center mt-4 leading-5 px-4">
        You can change this anytime in Settings.
      </Text>
    </View>
  );
}
