import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { saveInstagramHandle } from "@/services/profile";
import { impactLight } from "@/utils/haptics";

export default function OnboardingScreen() {
  const router = useRouter();
  const setInstagramHandle = useAuthStore((s) => s.setInstagramHandle);

  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, "");
  const isValid = /^[a-z0-9._]{1,30}$/.test(cleanHandle) && cleanHandle.length >= 1;

  const handleSubmit = async () => {
    if (!isValid) {
      setError("Enter a valid Instagram username");
      return;
    }

    setSaving(true);
    setError(null);

    const saved = await saveInstagramHandle(cleanHandle);

    if (saved) {
      impactLight();
      setInstagramHandle(saved);
      router.replace("/(main)/radar");
    } else {
      setSaving(false);
      setError("Could not save. Username may already be taken.");
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-echo-bg"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 justify-center px-8">
        {/* Logo / Header */}
        <View className="items-center mb-12">
          <View className="w-20 h-20 rounded-full bg-echo-primary/20 items-center justify-center mb-6">
            <Text className="text-4xl">📸</Text>
          </View>
          <Text className="text-3xl font-bold text-white mb-2">
            Almost there!
          </Text>
          <Text className="text-echo-muted text-center text-base leading-6">
            Add your Instagram so matches{"\n"}can connect with you
          </Text>
        </View>

        {/* Input */}
        <View className="mb-6">
          <View className="flex-row items-center bg-echo-surface rounded-2xl px-4 py-3">
            <Text className="text-echo-muted text-lg mr-1">@</Text>
            <TextInput
              className="flex-1 text-white text-lg"
              placeholder="username"
              placeholderTextColor="#555"
              value={handle}
              onChangeText={(text) => {
                setHandle(text);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              maxLength={31} // 30 + possible @
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {error && (
            <Text className="text-echo-danger text-sm mt-2 ml-1">
              {error}
            </Text>
          )}

          <Text className="text-echo-muted text-xs mt-3 ml-1">
            Your handle is only revealed to people you match with.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!isValid || saving}
          className={`py-4 rounded-2xl items-center ${
            isValid && !saving ? "bg-echo-primary" : "bg-echo-surface"
          }`}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              className={`text-lg font-semibold ${
                isValid ? "text-white" : "text-echo-muted"
              }`}
            >
              Continue
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
