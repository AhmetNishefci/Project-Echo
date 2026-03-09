import { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { saveGenderProfile } from "@/services/profile";
import { useAuthStore } from "@/stores/authStore";
import { impactMedium, impactLight } from "@/utils/haptics";
import { AgeRangeSlider } from "@/components/AgeRangeSlider";
import { getAgeFromDob, getDefaultAgeRange } from "@/utils/age";
import type { Gender, GenderPreference } from "@/types";

const GENDER_OPTIONS: { value: Gender; label: string; icon: string }[] = [
  { value: "male", label: "Male", icon: "male" },
  { value: "female", label: "Female", icon: "female" },
];

const PREFERENCE_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "both", label: "Everyone" },
];

export default function GenderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const existingGender = useAuthStore((s) => s.gender);
  const dateOfBirth = useAuthStore((s) => s.dateOfBirth);
  // Default to null so user must actively choose (M3 fix)
  const [gender, setGender] = useState<Gender | null>(null);
  const [preference, setPreference] = useState<GenderPreference | null>(null);

  // Age preference with smart default from DOB
  const userAge = dateOfBirth ? getAgeFromDob(dateOfBirth) : 25;
  const [defaultMin, defaultMax] = getDefaultAgeRange(userAge);
  const [ageMin, setAgeMin] = useState(defaultMin);
  const [ageMax, setAgeMax] = useState(defaultMax);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Auth guard: redirect unauthenticated users (H1 fix)
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  // If gender is already set, skip this screen
  useEffect(() => {
    if (existingGender) {
      router.replace("/onboarding");
    }
  }, [existingGender, router]);

  const canContinue = gender !== null && preference !== null;

  const handleContinue = async () => {
    if (!gender || !preference) return;
    // Double-tap guard (M4 fix)
    if (savingRef.current) return;
    savingRef.current = true;

    impactMedium();
    setSaving(true);

    const success = await saveGenderProfile(gender, preference, ageMin, ageMax);
    setSaving(false);
    savingRef.current = false;

    if (!success) {
      Alert.alert("Error", "Could not save your profile. Please try again.");
      return;
    }

    useAuthStore.getState().setGender(gender);
    useAuthStore.getState().setGenderPreference(preference);
    useAuthStore.getState().setAgePreference(ageMin, ageMax);
    router.replace("/onboarding");
  };

  const handleAgeChange = useCallback((lo: number, hi: number) => {
    setAgeMin(lo);
    setAgeMax(hi);
  }, []);

  return (
    <ScrollView
      className="flex-1 bg-wave-bg"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 32,
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Icon */}
      <View className="w-12 h-12 rounded-full bg-wave-surface items-center justify-center mb-6">
        <Ionicons name="person-outline" size={24} color="#6c63ff" />
      </View>

      <Text className="text-2xl font-bold text-white mb-2">About You</Text>
      <Text className="text-wave-muted text-sm text-center mb-8 leading-5">
        This helps us show you the right people nearby.
      </Text>

      {/* Gender Selection */}
      <Text className="text-wave-muted text-xs uppercase tracking-wider self-start mb-3">
        I am
      </Text>
      <View className="w-full flex-row mb-8" style={{ gap: 12 }}>
        {GENDER_OPTIONS.map((option) => {
          const selected = gender === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                impactLight();
                setGender(option.value);
              }}
              className={`flex-1 rounded-2xl py-4 items-center justify-center border-2 ${
                selected
                  ? "bg-wave-primary/20 border-wave-primary"
                  : "bg-wave-surface border-transparent"
              }`}
              activeOpacity={0.8}
            >
              <Ionicons
                name={option.icon as any}
                size={28}
                color={selected ? "#6c63ff" : "#666680"}
              />
              <Text
                className={`text-base font-semibold mt-2 ${
                  selected ? "text-white" : "text-wave-muted"
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Preference Selection */}
      <Text className="text-wave-muted text-xs uppercase tracking-wider self-start mb-3">
        Show me
      </Text>
      <View className="w-full mb-8" style={{ gap: 10 }}>
        {PREFERENCE_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                impactLight();
                setPreference(option.value);
              }}
              className={`w-full rounded-2xl py-3.5 px-4 flex-row items-center justify-between border-2 ${
                selected
                  ? "bg-wave-primary/20 border-wave-primary"
                  : "bg-wave-surface border-transparent"
              }`}
              activeOpacity={0.8}
            >
              <Text
                className={`text-base font-semibold ${
                  selected ? "text-white" : "text-wave-muted"
                }`}
              >
                {option.label}
              </Text>
              {selected && (
                <Ionicons name="checkmark-circle" size={22} color="#6c63ff" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Age Preference */}
      <Text className="text-wave-muted text-xs uppercase tracking-wider self-start mb-3">
        Age range
      </Text>
      <View className="w-full bg-wave-surface rounded-2xl p-4 mb-8">
        <AgeRangeSlider min={ageMin} max={ageMax} onChangeEnd={handleAgeChange} />
      </View>

      {/* Continue Button */}
      <TouchableOpacity
        onPress={handleContinue}
        disabled={saving || !canContinue}
        className={`w-full rounded-2xl py-4 items-center justify-center ${
          canContinue ? "bg-wave-primary" : "bg-wave-surface"
        }`}
        activeOpacity={0.8}
      >
        {saving ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text
            className={`text-base font-semibold ${
              canContinue ? "text-white" : "text-wave-muted"
            }`}
          >
            Continue
          </Text>
        )}
      </TouchableOpacity>

      <Text className="text-wave-muted text-xs text-center mt-4 leading-5">
        You can change your discovery preferences later in settings.
      </Text>
    </ScrollView>
  );
}
