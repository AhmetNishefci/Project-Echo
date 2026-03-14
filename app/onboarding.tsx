import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { saveInstagramHandle, saveSnapchatHandle } from "@/services/profile";
import { useAuthStore } from "@/stores/authStore";
import { impactMedium } from "@/utils/haptics";

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [igHandle, setIgHandle] = useState("");
  const [scHandle, setScHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Auth guard (H1 fix)
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const handleContinue = async () => {
    const trimmedIg = igHandle.trim().replace(/^@/, "");
    const trimmedSc = scHandle.trim().replace(/^@/, "");

    if (!trimmedIg && !trimmedSc) {
      Alert.alert("Required", "Please add at least one username so your matches can reach you.");
      return;
    }

    // Double-tap guard (M4 fix)
    if (savingRef.current) return;
    savingRef.current = true;

    impactMedium();
    setSaving(true);

    // Save whichever handles are provided
    let igSaved: string | null = null;
    let scSaved: string | null = null;

    if (trimmedIg) {
      const result = await saveInstagramHandle(trimmedIg);
      if (!result.handle) {
        setSaving(false);
        savingRef.current = false;
        if (result.error === "taken") {
          Alert.alert("Username Taken", "This Instagram username is already linked to another Wave account.");
        } else {
          Alert.alert("Invalid Username", "Please enter a valid Instagram username (letters, numbers, dots, and underscores).");
        }
        return;
      }
      igSaved = result.handle;
    }

    if (trimmedSc) {
      const result = await saveSnapchatHandle(trimmedSc);
      if (!result.handle) {
        setSaving(false);
        savingRef.current = false;
        if (result.error === "taken") {
          Alert.alert("Username Taken", "This Snapchat username is already linked to another Wave account.");
        } else {
          Alert.alert("Invalid Username", "Please enter a valid Snapchat username (3-15 characters, starts with a letter).");
        }
        return;
      }
      scSaved = result.handle;
    }

    setSaving(false);
    savingRef.current = false;

    if (igSaved) useAuthStore.getState().setInstagramHandle(igSaved);
    if (scSaved) useAuthStore.getState().setSnapchatHandle(scSaved);
    router.replace("/note");
  };

  const hasAnyInput = igHandle.trim().replace(/^@/, "").length > 0 || scHandle.trim().replace(/^@/, "").length > 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-wave-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-12 h-12 rounded-full bg-wave-surface items-center justify-center mb-6">
          <Ionicons name="chatbubbles-outline" size={24} color="#6c63ff" />
        </View>

        <Text className="text-2xl font-bold text-white mb-2">
          Add your socials
        </Text>
        <Text className="text-wave-muted text-sm text-center mb-8 leading-5">
          Add at least one so your matches can connect with you.
        </Text>

        {/* Instagram input */}
        <View className="w-full mb-4">
          <View className="flex-row items-center mb-2">
            <Ionicons name="logo-instagram" size={16} color="#6c63ff" />
            <Text className="text-wave-muted text-xs ml-1.5">Instagram</Text>
          </View>
          <View className="w-full bg-wave-surface rounded-2xl px-4 flex-row items-center" style={{ height: 52 }}>
            <Text className="text-wave-muted text-base" style={{ lineHeight: 20 }}>@</Text>
            <TextInput
              value={igHandle}
              onChangeText={setIgHandle}
              placeholder="username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              className="flex-1 text-white text-base ml-1"
              style={{ lineHeight: 20, paddingVertical: 0 }}
              returnKeyType="next"
            />
          </View>
        </View>

        {/* Snapchat input */}
        <View className="w-full mb-6">
          <View className="flex-row items-center mb-2">
            <Ionicons name="logo-snapchat" size={16} color="#FFFC00" />
            <Text className="text-wave-muted text-xs ml-1.5">Snapchat</Text>
          </View>
          <View className="w-full bg-wave-surface rounded-2xl px-4 flex-row items-center" style={{ height: 52 }}>
            <TextInput
              value={scHandle}
              onChangeText={setScHandle}
              placeholder="username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              className="flex-1 text-white text-base"
              style={{ lineHeight: 20, paddingVertical: 0 }}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving || !hasAnyInput}
          className={`w-full rounded-2xl py-4 items-center justify-center ${
            hasAnyInput ? "bg-wave-primary" : "bg-wave-surface"
          }`}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className={`text-base font-semibold ${hasAnyInput ? "text-white" : "text-wave-muted"}`}>
              Continue
            </Text>
          )}
        </TouchableOpacity>

        <Text className="text-wave-muted text-xs text-center mt-4 leading-5">
          Your socials are only revealed after a mutual match.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
