import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/services/supabase";
import { useAuthStore } from "@/stores/authStore";
import { logger } from "@/utils/logger";

export default function AgeBlockedScreen() {
  const insets = useSafeAreaInsets();

  const handleSignOut = async () => {
    try {
      useAuthStore.getState().reset();
      await supabase.auth.signOut();
    } catch (err) {
      logger.error("Sign out from age-blocked failed", err);
    }
  };

  return (
    <View
      className="flex-1 bg-wave-bg items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-14 h-14 rounded-full bg-red-500/10 items-center justify-center mb-6">
        <Ionicons name="lock-closed-outline" size={28} color="#ef4444" />
      </View>

      <Text className="text-2xl font-bold text-white mb-3">Age Restricted</Text>
      <Text className="text-wave-muted text-sm text-center leading-5 mb-8">
        You must be at least 18 years old to use Wave.{"\n"}Come back when you're old enough!
      </Text>

      <TouchableOpacity
        onPress={handleSignOut}
        className="bg-wave-surface rounded-2xl py-4 px-8 items-center"
        activeOpacity={0.8}
      >
        <Text className="text-white text-base font-semibold">Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
