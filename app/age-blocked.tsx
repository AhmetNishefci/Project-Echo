import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { signOut } from "@/services/auth";
import { impactMedium } from "@/utils/haptics";
import { logger } from "@/utils/logger";
import { COLORS } from "@/constants/colors";

export default function AgeBlockedScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const signingOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    impactMedium();
    setLoading(true);

    try {
      await signOut();
    } catch (err) {
      logger.error("Sign out from age-blocked failed", err);
      setLoading(false);
      signingOutRef.current = false;
      Alert.alert("Couldn't Sign Out", "Something went wrong. Please try again.");
    }
  };

  return (
    <View
      className="flex-1 bg-wave-bg items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-14 h-14 rounded-full bg-red-500/10 items-center justify-center mb-6">
        <Ionicons name="lock-closed-outline" size={28} color={COLORS.danger} />
      </View>

      <Text className="text-2xl font-bold text-white mb-3">Age Restricted</Text>
      <Text className="text-wave-muted text-sm text-center leading-5 mb-8">
        You must be at least 18 years old to use Wave.{"\n"}Come back when you're old enough!
      </Text>

      <TouchableOpacity
        onPress={handleSignOut}
        disabled={loading}
        className="bg-wave-surface rounded-2xl py-4 px-8 items-center"
        activeOpacity={0.8}
        accessibilityLabel="Sign Out"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text className="text-white text-base font-semibold">Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
