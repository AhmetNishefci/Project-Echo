import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { saveInstagramHandle } from "@/services/profile";
import { useAuthStore } from "@/stores/authStore";
import { impactMedium } from "@/utils/haptics";

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Auth guard (H1 fix)
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const handleContinue = async () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) {
      Alert.alert("Required", "Please enter your Instagram username.");
      return;
    }

    // Double-tap guard (M4 fix)
    if (savingRef.current) return;
    savingRef.current = true;

    impactMedium();
    setSaving(true);

    const saved = await saveInstagramHandle(trimmed);
    setSaving(false);
    savingRef.current = false;

    if (!saved) {
      Alert.alert(
        "Invalid Username",
        "Please enter a valid Instagram username (letters, numbers, dots, and underscores).",
      );
      return;
    }

    useAuthStore.getState().setInstagramHandle(saved);
    router.replace("/note");
  };

  // Button should only be enabled when there's actual content after stripping @
  const trimmedHandle = handle.trim().replace(/^@/, "");
  const canContinue = trimmedHandle.length > 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-echo-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="w-12 h-12 rounded-full bg-echo-surface items-center justify-center mb-6">
          <Ionicons name="logo-instagram" size={24} color="#6c63ff" />
        </View>

        <Text className="text-2xl font-bold text-white mb-2">
          Add your Instagram
        </Text>
        <Text className="text-echo-muted text-sm text-center mb-8 leading-5">
          When you match with someone, you'll both see each other's Instagram username so you can connect.
        </Text>

        <View className="w-full bg-echo-surface rounded-2xl px-4 flex-row items-center mb-4" style={{ height: 52 }}>
          <Text className="text-echo-muted text-base" style={{ lineHeight: 20 }}>@</Text>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="username"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            className="flex-1 text-white text-base ml-1"
            style={{ lineHeight: 20, paddingVertical: 0 }}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
        </View>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving || !canContinue}
          className={`w-full rounded-2xl py-4 items-center justify-center ${
            canContinue ? "bg-echo-primary" : "bg-echo-surface"
          }`}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className={`text-base font-semibold ${canContinue ? "text-white" : "text-echo-muted"}`}>
              Continue
            </Text>
          )}
        </TouchableOpacity>

        <Text className="text-echo-muted text-xs text-center mt-4 leading-5">
          Your username is only revealed after a mutual match.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
