import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { saveNote } from "@/services/profile";
import { useAuthStore } from "@/stores/authStore";
import { impactMedium } from "@/utils/haptics";

const MAX_NOTE_LENGTH = 40;

export default function NoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Auth guard (H1 fix)
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  const handleContinue = async () => {
    // Double-tap guard (M4 fix)
    if (savingRef.current) return;

    const trimmed = note.trim();
    if (!trimmed) {
      // Treat empty as skip — explicitly set store note to null (L2 fix)
      useAuthStore.getState().setNote(null);
      router.replace("/nearby-alerts");
      return;
    }

    savingRef.current = true;
    impactMedium();
    setSaving(true);

    const success = await saveNote(trimmed);
    setSaving(false);
    savingRef.current = false;

    if (!success) {
      Alert.alert(
        "Couldn't Save",
        "Your note couldn't be saved. You can try again in settings.",
        [{ text: "Continue", onPress: () => router.replace("/nearby-alerts") }],
      );
      return;
    }

    useAuthStore.getState().setNote(trimmed);
    router.replace("/nearby-alerts");
  };

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
          <Ionicons name="pencil-outline" size={24} color="#6c63ff" />
        </View>

        <Text className="text-2xl font-bold text-white mb-2">
          Add a Note
        </Text>
        <Text className="text-echo-muted text-sm text-center mb-8 leading-5">
          Help people nearby recognize you. Something like your name, what you're wearing, or where you are.
        </Text>

        <View className="w-full bg-echo-surface rounded-2xl px-4 flex-row items-center mb-2" style={{ height: 52 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={'e.g. "Alex, red hoodie near the bar"'}
            placeholderTextColor="#555"
            autoCapitalize="sentences"
            autoCorrect={false}
            className="flex-1 text-white text-base"
            style={{ lineHeight: 20, paddingVertical: 0 }}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            maxLength={MAX_NOTE_LENGTH}
          />
        </View>

        <Text className="text-echo-muted text-xs self-end mb-4">
          {note.length}/{MAX_NOTE_LENGTH}
        </Text>

        <TouchableOpacity
          onPress={handleContinue}
          disabled={saving}
          className={`w-full rounded-2xl py-4 items-center justify-center ${
            note.trim()
              ? "bg-echo-primary"
              : "border border-echo-muted/50"
          }`}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {note.trim() ? "Continue" : "Skip for now"}
            </Text>
          )}
        </TouchableOpacity>

        <Text className="text-echo-muted text-xs text-center mt-6 leading-5">
          This is optional. You can always add or change it in settings.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
