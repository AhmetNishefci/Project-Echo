import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, Linking, TextInput, Switch } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useBleStore } from "@/stores/bleStore";
import { useWaveStore } from "@/stores/waveStore";
import { useAuthStore } from "@/stores/authStore";
import { signOut } from "@/services/auth";
import { saveInstagramHandle, saveSnapchatHandle, updateGenderPreference, updateAgePreference, saveNote, saveNearbyAlertsPreference, saveDailyPushesPreference } from "@/services/profile";
import { requestLocationPermission, hasLocationPermission, isLocationBlocked } from "@/services/location";
import { supabase } from "@/services/supabase";
import { waveBleManager } from "@/services/ble/bleManager";
import { impactLight } from "@/utils/haptics";
import { Toast, type ToastVariant } from "@/components/Toast";
import { AgeRangeSlider } from "@/components/AgeRangeSlider";
import { getAgeFromDob } from "@/utils/age";
import type { GenderPreference } from "@/types";

const PREFERENCE_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "both", label: "Everyone" },
];

export default function SettingsScreen() {
  const { session, dateOfBirth, instagramHandle, setInstagramHandle, snapchatHandle, setSnapchatHandle, gender, genderPreference, setGenderPreference, agePreferenceMin, agePreferenceMax, setAgePreference, note, setNote, nearbyAlertsEnabled, setNearbyAlertsEnabled, dailyPushesEnabled, setDailyPushesEnabled } = useAuthStore();
  const totalMatches = useWaveStore((s) => s.matches.length);
  const rawEmail = session?.user?.email ?? null;
  const userEmail = rawEmail?.includes("privaterelay.appleid.com")
    ? "Hidden (Apple)"
    : rawEmail;
  const userPhone = session?.user?.phone ?? null;
  const router = useRouter();

  const [deleting, setDeleting] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState(instagramHandle ?? "");
  const [savingHandle, setSavingHandle] = useState(false);
  const [editingSnapchat, setEditingSnapchat] = useState(false);
  const [snapchatInput, setSnapchatInput] = useState(snapchatHandle ?? "");
  const [savingSnapchat, setSavingSnapchat] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [savingAgePref, setSavingAgePref] = useState(false);
  const ageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState(note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [savingDailyPushes, setSavingDailyPushes] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");

  // Clean up debounce timer on unmount to avoid state updates on unmounted component
  useEffect(() => {
    return () => {
      if (ageSaveTimer.current) clearTimeout(ageSaveTimer.current);
    };
  }, []);

  const showToast = useCallback((msg: string, variant: ToastVariant = "success") => {
    setToastVariant(variant);
    setToastMessage(msg);
  }, []);

  const handleSaveHandle = async () => {
    const trimmed = handleInput.trim().replace(/^@/, "");
    if (!trimmed) return;

    impactLight();
    setSavingHandle(true);

    const result = await saveInstagramHandle(trimmed);
    setSavingHandle(false);

    if (result.handle) {
      setInstagramHandle(result.handle);
      setEditingHandle(false);
      showToast("Username updated");
    } else if (result.error === "taken") {
      showToast("This username is already taken.", "error");
    } else {
      showToast("Invalid username. Use letters, numbers, dots, and underscores.", "error");
    }
  };

  const handleSaveSnapchat = async () => {
    const trimmed = snapchatInput.trim().replace(/^@/, "");
    if (!trimmed) return;

    impactLight();
    setSavingSnapchat(true);

    const result = await saveSnapchatHandle(trimmed);
    setSavingSnapchat(false);

    if (result.handle) {
      setSnapchatHandle(result.handle);
      setEditingSnapchat(false);
      showToast("Snapchat updated");
    } else if (result.error === "taken") {
      showToast("This Snapchat username is already taken.", "error");
    } else {
      showToast("Invalid Snapchat username. 3-15 characters, starts with a letter.", "error");
    }
  };

  const handlePreferenceChange = async (pref: GenderPreference) => {
    if (pref === genderPreference || savingPreference) return;

    impactLight();
    setSavingPreference(true);

    const success = await updateGenderPreference(pref);
    setSavingPreference(false);

    if (success) {
      setGenderPreference(pref);
      const label = PREFERENCE_OPTIONS.find((o) => o.value === pref)?.label ?? pref;
      showToast(`Now showing ${label.toLowerCase()}`);
    } else {
      showToast("Could not update preference. Try again.", "error");
    }
  };

  // Debounced save: update store immediately, persist to server after 500ms
  const handleAgePreferenceChange = useCallback((min: number, max: number) => {
    setAgePreference(min, max);
    if (ageSaveTimer.current) clearTimeout(ageSaveTimer.current);
    ageSaveTimer.current = setTimeout(async () => {
      setSavingAgePref(true);
      const success = await updateAgePreference(min, max);
      setSavingAgePref(false);
      if (success) {
        showToast(`Age range: ${min}–${max}`);
      } else {
        showToast("Could not update age range. Try again.", "error");
      }
    }, 500);
  }, [setAgePreference, showToast]);

  const handleToggleAlerts = async (enabled: boolean) => {
    if (savingAlerts) return;
    setSavingAlerts(true);

    // When enabling, ensure location permission is granted
    if (enabled) {
      const alreadyGranted = await hasLocationPermission();
      if (!alreadyGranted) {
        const blocked = await isLocationBlocked();
        if (blocked) {
          setSavingAlerts(false);
          Alert.alert(
            "Location Access Needed",
            "Location permission was denied. To enable nearby alerts, open Settings and allow location for Wave.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }

        const permResult = await requestLocationPermission();
        if (permResult !== "granted") {
          setSavingAlerts(false);
          showToast("Location permission is required for nearby alerts.", "error");
          return;
        }
      }
    }

    const success = await saveNearbyAlertsPreference(enabled);
    setSavingAlerts(false);

    if (success) {
      setNearbyAlertsEnabled(enabled);
      showToast(enabled ? "Nearby alerts enabled" : "Nearby alerts disabled");
    } else {
      showToast("Could not update alerts. Try again.", "error");
    }
  };

  const handleToggleDailyPushes = async (enabled: boolean) => {
    if (savingDailyPushes) return;
    setSavingDailyPushes(true);

    const success = await saveDailyPushesPreference(enabled);
    setSavingDailyPushes(false);

    if (success) {
      setDailyPushesEnabled(enabled);
      showToast(enabled ? "Daily reminders enabled" : "Daily reminders disabled");
    } else {
      showToast("Could not update preference. Try again.", "error");
    }
  };

  const handleSaveNote = async () => {
    const trimmed = noteInput.trim();
    impactLight();
    setSavingNote(true);

    const success = await saveNote(trimmed || null);
    setSavingNote(false);

    if (success) {
      setNote(trimmed || null);
      setEditingNote(false);
      showToast(trimmed ? "Note updated" : "Note cleared");
    } else {
      showToast("Could not update note. Try again.", "error");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account, all matches, and your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              // Use getUser() to validate the token, not cached getSession() (H14 fix)
              const { data: { user }, error: userError } = await supabase.auth.getUser();
              if (userError || !user) {
                setDeleting(false);
                showToast("Not signed in. Please restart the app.", "error");
                return;
              }
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                setDeleting(false);
                showToast("Session expired. Please sign in again.", "error");
                return;
              }

              const { error } = await supabase.functions.invoke("delete-account", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });

              if (error) {
                setDeleting(false);
                showToast("Failed to delete account. Try again.", "error");
                return;
              }

              // Clean up local state
              await waveBleManager.stop();
              useWaveStore.getState().reset();
              useBleStore.getState().reset();
              useAuthStore.getState().reset();
              await supabase.auth.signOut();
              router.replace("/");
            } catch {
              setDeleting(false);
              showToast("Something went wrong. Try again.", "error");
            }
          },
        },
      ],
    );
  };

  return (
    <>
      {/* Full-screen blocking overlay while deleting */}
      <Modal visible={deleting} transparent animationType="fade">
        <View className="flex-1 bg-black/80 items-center justify-center">
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text className="text-white text-base mt-4">Deleting account...</Text>
        </View>
      </Modal>

    <ScrollView className="flex-1 bg-wave-bg pt-16 px-4">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Settings</Text>
      </View>

      {/* Account */}
      <Section title="Account">
        {userEmail && (
          <InfoRow label="Email" value={userEmail} />
        )}
        {userPhone && (
          <InfoRow label="Phone" value={userPhone} />
        )}
        {gender && (
          <InfoRow label="Gender" value={gender === "male" ? "Male" : "Female"} />
        )}
        {dateOfBirth && (
          <>
            <InfoRow label="Birthday" value={formatDob(dateOfBirth)} />
            <InfoRow label="Age" value={`${getAgeFromDob(dateOfBirth)}`} />
          </>
        )}
        {(gender || dateOfBirth) && (
          <Text className="text-wave-muted text-xs mt-2 leading-4">
            Gender and date of birth are set during signup and cannot be changed.
          </Text>
        )}
      </Section>

      {/* Stats */}
      <Section title="Stats">
        <InfoRow label="Total Matches" value={String(totalMatches)} />
      </Section>

      {/* Discovery Preference */}
      <Section title="Discovery">
        <Text className="text-wave-muted text-xs mb-3">Show me</Text>
        <View style={{ gap: 8 }}>
          {PREFERENCE_OPTIONS.map((option) => {
            const selected = genderPreference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => handlePreferenceChange(option.value)}
                disabled={savingPreference}
                className={`rounded-xl py-3 px-4 flex-row items-center justify-between border ${
                  selected
                    ? "bg-wave-primary/20 border-wave-primary"
                    : "bg-wave-bg border-transparent"
                }`}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selected ? "text-white" : "text-wave-muted"
                  }`}
                >
                  {option.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark-circle" size={20} color="#6c63ff" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {savingPreference && (
          <ActivityIndicator size="small" color="#6c63ff" style={{ marginTop: 8 }} />
        )}

        {/* Age Range */}
        <View className="mt-4 pt-4 border-t border-wave-bg">
          <Text className="text-wave-muted text-xs mb-3">Age range</Text>
          <AgeRangeSlider
            min={agePreferenceMin ?? 18}
            max={agePreferenceMax ?? 80}
            onChangeEnd={handleAgePreferenceChange}
          />
          {savingAgePref && (
            <ActivityIndicator size="small" color="#6c63ff" style={{ marginTop: 8 }} />
          )}
        </View>

        <Text className="text-wave-muted text-xs mt-3 leading-4">
          Only people matching your preferences will appear on your radar.
        </Text>
      </Section>

      {/* Nearby Alerts */}
      <Section title="Nearby Alerts">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-white text-sm font-semibold">Nearby Alerts</Text>
            <Text className="text-wave-muted text-xs mt-1 leading-4">
              Get notified when Wave users are near you
            </Text>
          </View>
          <Switch
            value={nearbyAlertsEnabled}
            onValueChange={handleToggleAlerts}
            disabled={savingAlerts}
            trackColor={{ false: "#333", true: "#6c63ff" }}
            thumbColor="white"
          />
        </View>
        {savingAlerts && (
          <ActivityIndicator size="small" color="#6c63ff" style={{ marginTop: 8 }} />
        )}
        <Text className="text-wave-muted text-xs mt-3 leading-4">
          Uses your location when you open Wave. Your location is never shared with other users.
        </Text>
      </Section>

      {/* Daily Reminders */}
      <Section title="Daily Reminders">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-white text-sm font-semibold">Evening Reminders</Text>
            <Text className="text-wave-muted text-xs mt-1 leading-4">
              Get a daily nudge during peak hours (6–8 PM)
            </Text>
          </View>
          <Switch
            value={dailyPushesEnabled}
            onValueChange={handleToggleDailyPushes}
            disabled={savingDailyPushes}
            trackColor={{ false: "#333", true: "#6c63ff" }}
            thumbColor="white"
          />
        </View>
        {savingDailyPushes && (
          <ActivityIndicator size="small" color="#6c63ff" style={{ marginTop: 8 }} />
        )}
        <Text className="text-wave-muted text-xs mt-3 leading-4">
          One notification per day when Wave users are most active near you.
        </Text>
      </Section>

      {/* Socials */}
      <Section title="Socials">
        {/* Instagram */}
        {editingHandle ? (
          <View className="mb-3">
            <View className="flex-row items-center mb-2">
              <Ionicons name="logo-instagram" size={14} color="#6c63ff" />
              <Text className="text-wave-muted text-xs ml-1.5">Instagram</Text>
            </View>
            <View className="bg-wave-bg rounded-xl flex-row items-center px-3" style={{ height: 44 }}>
              <Text className="text-wave-muted text-sm" style={{ lineHeight: 18 }}>@</Text>
              <TextInput
                value={handleInput}
                onChangeText={setHandleInput}
                placeholder="username"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                className="flex-1 text-white text-sm ml-1"
                style={{ lineHeight: 18, paddingVertical: 0 }}
                autoFocus
                returnKeyType="done"
                maxLength={30}
                onSubmitEditing={handleSaveHandle}
              />
            </View>
            <View className="flex-row justify-end mt-2">
              <TouchableOpacity
                onPress={() => {
                  setEditingHandle(false);
                  setHandleInput(instagramHandle ?? "");
                }}
                className="rounded-lg px-4 py-2 mr-2"
              >
                <Text className="text-wave-muted text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveHandle}
                disabled={savingHandle || !handleInput.trim()}
                className="bg-wave-primary rounded-lg px-4 py-2"
              >
                {savingHandle ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingHandle(true)} activeOpacity={0.7} className="mb-3">
            <View className="flex-row justify-between items-center py-1.5">
              <View className="flex-row items-center">
                <Ionicons name="logo-instagram" size={16} color="#6c63ff" style={{ marginRight: 8 }} />
                <Text className="text-wave-muted text-sm">Instagram</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-white text-sm font-mono mr-2">
                  {instagramHandle ? `@${instagramHandle}` : "Not set"}
                </Text>
                <Ionicons name="pencil" size={14} color="#6c63ff" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View className="h-px bg-wave-bg mb-3" />

        {/* Snapchat */}
        {editingSnapchat ? (
          <View>
            <View className="flex-row items-center mb-2">
              <Ionicons name="logo-snapchat" size={14} color="#FFFC00" />
              <Text className="text-wave-muted text-xs ml-1.5">Snapchat</Text>
            </View>
            <View className="bg-wave-bg rounded-xl flex-row items-center px-3" style={{ height: 44 }}>
              <TextInput
                value={snapchatInput}
                onChangeText={setSnapchatInput}
                placeholder="username"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                className="flex-1 text-white text-sm"
                style={{ lineHeight: 18, paddingVertical: 0 }}
                autoFocus
                returnKeyType="done"
                maxLength={15}
                onSubmitEditing={handleSaveSnapchat}
              />
            </View>
            <View className="flex-row justify-end mt-2">
              <TouchableOpacity
                onPress={() => {
                  setEditingSnapchat(false);
                  setSnapchatInput(snapchatHandle ?? "");
                }}
                className="rounded-lg px-4 py-2 mr-2"
              >
                <Text className="text-wave-muted text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveSnapchat}
                disabled={savingSnapchat || !snapchatInput.trim()}
                className="bg-wave-primary rounded-lg px-4 py-2"
              >
                {savingSnapchat ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingSnapchat(true)} activeOpacity={0.7}>
            <View className="flex-row justify-between items-center py-1.5">
              <View className="flex-row items-center">
                <Ionicons name="logo-snapchat" size={16} color="#FFFC00" style={{ marginRight: 8 }} />
                <Text className="text-wave-muted text-sm">Snapchat</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-white text-sm font-mono mr-2">
                  {snapchatHandle || "Not set"}
                </Text>
                <Ionicons name="pencil" size={14} color="#6c63ff" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        <Text className="text-wave-muted text-xs mt-3 leading-4">
          Your socials are shown to your match after a mutual wave.
        </Text>
      </Section>

      {/* Note */}
      <Section title="Note">
        {editingNote ? (
          <View>
            <View className="bg-wave-bg rounded-xl flex-row items-center px-3" style={{ height: 44 }}>
              <TextInput
                value={noteInput}
                onChangeText={setNoteInput}
                placeholder="e.g. Alex, red hoodie"
                placeholderTextColor="#555"
                autoCapitalize="sentences"
                autoCorrect={false}
                className="flex-1 text-white text-sm"
                style={{ lineHeight: 18, paddingVertical: 0 }}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveNote}
                maxLength={40}
              />
              {noteInput.length > 0 && (
                <TouchableOpacity onPress={() => setNoteInput("")} className="pl-2">
                  <Ionicons name="close-circle" size={18} color="#888" />
                </TouchableOpacity>
              )}
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <Text className="text-wave-muted text-xs">{noteInput.length}/40</Text>
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => {
                    setEditingNote(false);
                    setNoteInput(note ?? "");
                  }}
                  className="rounded-lg px-4 py-2 mr-2"
                >
                  <Text className="text-wave-muted text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveNote}
                  disabled={savingNote}
                  className="bg-wave-primary rounded-lg px-5 py-2"
                >
                  {savingNote ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white text-sm font-semibold">Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingNote(true)} activeOpacity={0.7}>
            <View className="flex-row justify-between items-center py-1.5">
              <Text className="text-wave-muted text-sm">Note</Text>
              <View className="flex-row items-center">
                <Text className="text-white text-sm mr-2" numberOfLines={1} style={{ maxWidth: 180 }}>
                  {note || "Not set"}
                </Text>
                <Ionicons name="pencil" size={14} color="#6c63ff" />
              </View>
            </View>
          </TouchableOpacity>
        )}
        <Text className="text-wave-muted text-xs mt-2 leading-4">
          Visible to everyone nearby. Changes appear within about 30 seconds.
        </Text>
      </Section>

      {/* Safety */}
      <Section title="Safety">
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Report a User",
              "To report someone, long-press their match in your match history and choose \"Report User\". You can also email us directly.",
              [
                { text: "OK" },
                {
                  text: "Email Support",
                  onPress: () => Linking.openURL("mailto:support@wave-app.com?subject=Report%20User"),
                },
              ],
            );
          }}
          className="py-3"
        >
          <Text className="text-white text-sm">Report a User</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Block a User",
              "To remove someone, long-press their match in your match history and choose \"Remove Match\". This removes them from your history. Full blocking will be available in a future update.",
              [{ text: "OK" }],
            );
          }}
          className="py-3"
        >
          <Text className="text-white text-sm">Block a User</Text>
        </TouchableOpacity>
      </Section>

      {/* Legal */}
      <Section title="Legal">
        <TouchableOpacity
          onPress={() => Linking.openURL("https://wave-app.com/privacy")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Privacy Policy</Text>
          <Text className="text-wave-muted text-xs">&rsaquo;</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL("https://wave-app.com/terms")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Terms of Service</Text>
          <Text className="text-wave-muted text-xs">&rsaquo;</Text>
        </TouchableOpacity>
      </Section>

      {/* Danger zone */}
      <Section title="Account Actions">
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Sign Out",
              "You'll need to sign in again to use Wave.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign Out",
                  onPress: async () => {
                    try {
                      await signOut();
                      router.replace("/");
                    } catch {
                      showToast("Sign out failed. Try again.", "error");
                    }
                  },
                },
              ],
            );
          }}
          className="py-3"
        >
          <Text className="text-white text-sm">Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDeleteAccount}
          className="py-3"
        >
          <Text className="text-wave-danger text-sm">Delete Account</Text>
        </TouchableOpacity>
        <Text className="text-wave-muted text-xs mt-1">
          Permanently removes your account, matches, and all data.
        </Text>
      </Section>

      {/* App info */}
      <View className="items-center mt-4 mb-12">
        <Text className="text-wave-muted text-xs">
          Wave v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
    </ScrollView>

    {/* Toast */}
    <Toast message={toastMessage} variant={toastVariant} onDismiss={() => setToastMessage(null)} />
    </>
  );
}

function formatDob(dob: string): string {
  const d = new Date(dob + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="text-wave-muted text-xs uppercase tracking-wider mb-2">
        {title}
      </Text>
      <View className="bg-wave-surface rounded-2xl p-4">{children}</View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
}) {
  return (
    <View className="flex-row justify-between items-center py-1.5">
      <Text className="text-wave-muted text-sm">{label}</Text>
      <Text
        className={`text-sm font-mono ${isError ? "text-wave-danger" : "text-white"}`}
        numberOfLines={1}
        style={{ maxWidth: 180 }}
      >
        {value}
      </Text>
    </View>
  );
}
