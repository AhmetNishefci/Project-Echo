import { useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { signInWithGoogle } from "@/services/auth";
import { impactMedium } from "@/utils/haptics";

const appIcon = require("../assets/icon.png");

const STEPS = [
  { icon: "radio-outline" as const, text: "Discover people around you" },
  { icon: "hand-left-outline" as const, text: "Wave at someone you find interesting" },
  { icon: "people-outline" as const, text: "Match when they wave back" },
];

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    impactMedium();
    setLoading(true);

    const { success, error } = await signInWithGoogle();

    setLoading(false);

    if (success) {
      router.replace("/onboarding");
    } else if (error && error !== "cancelled") {
      Alert.alert("Sign In Failed", error);
    }
  };

  return (
    <View
      className="flex-1 bg-echo-bg items-center justify-center px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Branding */}
      <Image
        source={appIcon}
        className="w-24 h-24 rounded-3xl mb-6"
        resizeMode="contain"
      />
      <Text className="text-5xl font-bold text-white mb-10">Wave</Text>

      {/* How it works */}
      <View className="mb-12 items-center">
        {STEPS.map((step, i) => (
          <View key={i} className="flex-row items-center mb-5">
            <View className="w-10 h-10 rounded-full bg-echo-surface items-center justify-center mr-3">
              <Ionicons name={step.icon} size={20} color="#6c63ff" />
            </View>
            <Text className="text-white text-sm">{step.text}</Text>
          </View>
        ))}
      </View>

      {/* Sign in button */}
      <TouchableOpacity
        onPress={handleSignIn}
        disabled={loading}
        className="w-full bg-echo-primary rounded-2xl py-4 flex-row items-center justify-center"
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color="white" style={{ marginRight: 8 }} />
            <Text className="text-white text-base font-semibold">
              Continue with Google
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text className="text-echo-muted text-xs text-center mt-4 leading-5">
        Your identity stays hidden until a mutual match.
      </Text>
    </View>
  );
}
