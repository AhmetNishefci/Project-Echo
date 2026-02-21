import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, Linking, TextInput } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { useAuthStore } from "@/stores/authStore";
import { signOut } from "@/services/auth";
import { saveInstagramHandle, updateGenderPreference, saveNote } from "@/services/profile";
import { supabase } from "@/services/supabase";
import { echoBleManager } from "@/services/ble/bleManager";
import { impactLight } from "@/utils/haptics";
import { Toast, type ToastVariant } from "@/components/Toast";
import type { GenderPreference } from "@/types";

const PREFERENCE_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
  { value: "both", label: "Everyone" },
];

export default function SettingsScreen() {
  const { userId, instagramHandle, setInstagramHandle, gender, genderPreference, setGenderPreference, note, setNote } = useAuthStore();
  const router = useRouter();

  const [deleting, setDeleting] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState(instagramHandle ?? "");
  const [savingHandle, setSavingHandle] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState(note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>("success");

  const showToast = (msg: string, variant: ToastVariant = "success") => {
    setToastVariant(variant);
    setToastMessage(msg);
  };

  const handleSaveHandle = async () => {
    const trimmed = handleInput.trim().replace(/^@/, "");
    if (!trimmed) return;

    impactLight();
    setSavingHandle(true);

    const saved = await saveInstagramHandle(trimmed);
    setSavingHandle(false);

    if (saved) {
      setInstagramHandle(saved);
      setEditingHandle(false);
      showToast("Username updated");
    } else {
      showToast("Invalid username. Use letters, numbers, dots, and underscores.", "error");
    }
  };

  const handlePreferenceChange = async (pref: GenderPreference) => {
    if (pref === genderPreference) return;

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

  const handleClearMatches = () => {
    Alert.alert(
      "Clear Match History",
      "This will remove all saved matches. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            useEchoStore.getState().clearMatches();
            showToast("Match history cleared");
          },
        },
      ],
    );
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
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                setDeleting(false);
                showToast("Not signed in. Please restart the app.", "error");
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
              await echoBleManager.stop();
              useEchoStore.getState().reset();
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

    <ScrollView className="flex-1 bg-echo-bg pt-16 px-4">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Settings</Text>
      </View>

      {/* Account */}
      <Section title="Account">
        <InfoRow label="User ID" value={userId ? userId.substring(0, 12) + "..." : "Not authenticated"} />
        <InfoRow label="Signed in via" value="Google" />
        {gender && (
          <InfoRow label="Gender" value={gender === "male" ? "Male" : "Female"} />
        )}
        {gender && (
          <Text className="text-echo-muted text-xs mt-2 leading-4">
            Gender is set during signup and cannot be changed.
          </Text>
        )}
      </Section>

      {/* Discovery Preference */}
      <Section title="Discovery">
        <Text className="text-echo-muted text-xs mb-3">Show me</Text>
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
                    ? "bg-echo-primary/20 border-echo-primary"
                    : "bg-echo-bg border-transparent"
                }`}
                activeOpacity={0.7}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selected ? "text-white" : "text-echo-muted"
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
        <Text className="text-echo-muted text-xs mt-3 leading-4">
          Only people matching your preference will appear on your radar.
        </Text>
      </Section>

      {/* Instagram */}
      <Section title="Instagram">
        {editingHandle ? (
          <View>
            <View className="bg-echo-bg rounded-xl flex-row items-center px-3" style={{ height: 44 }}>
              <Text className="text-echo-muted text-sm" style={{ lineHeight: 18 }}>@</Text>
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
                onSubmitEditing={handleSaveHandle}
              />
            </View>
            <View className="flex-row justify-end mt-3">
              <TouchableOpacity
                onPress={() => {
                  setEditingHandle(false);
                  setHandleInput(instagramHandle ?? "");
                }}
                className="rounded-lg px-4 py-2 mr-2"
              >
                <Text className="text-echo-muted text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveHandle}
                disabled={savingHandle || !handleInput.trim()}
                className="bg-echo-primary rounded-lg px-5 py-2"
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
          <TouchableOpacity onPress={() => setEditingHandle(true)} activeOpacity={0.7}>
            <View className="flex-row justify-between items-center py-1.5">
              <Text className="text-echo-muted text-sm">Username</Text>
              <View className="flex-row items-center">
                <Text className="text-white text-sm font-mono mr-2">
                  {instagramHandle ? `@${instagramHandle}` : "Not set"}
                </Text>
                <Ionicons name="pencil" size={14} color="#6c63ff" />
              </View>
            </View>
          </TouchableOpacity>
        )}
        <Text className="text-echo-muted text-xs mt-2 leading-4">
          Shown to you and your match after a mutual wave.
        </Text>
      </Section>

      {/* Note */}
      <Section title="Note">
        {editingNote ? (
          <View>
            <View className="bg-echo-bg rounded-xl flex-row items-center px-3" style={{ height: 44 }}>
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
              <Text className="text-echo-muted text-xs">{noteInput.length}/40</Text>
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => {
                    setEditingNote(false);
                    setNoteInput(note ?? "");
                  }}
                  className="rounded-lg px-4 py-2 mr-2"
                >
                  <Text className="text-echo-muted text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveNote}
                  disabled={savingNote}
                  className="bg-echo-primary rounded-lg px-5 py-2"
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
              <Text className="text-echo-muted text-sm">Note</Text>
              <View className="flex-row items-center">
                <Text className="text-white text-sm mr-2" numberOfLines={1} style={{ maxWidth: 180 }}>
                  {note || "Not set"}
                </Text>
                <Ionicons name="pencil" size={14} color="#6c63ff" />
              </View>
            </View>
          </TouchableOpacity>
        )}
        <Text className="text-echo-muted text-xs mt-2 leading-4">
          Visible to everyone nearby. Changes appear within about 30 seconds.
        </Text>
      </Section>

      {/* Actions */}
      <Section title="Data">
        <TouchableOpacity
          onPress={handleClearMatches}
          className="py-3"
        >
          <Text className="text-echo-danger text-sm">Clear Match History</Text>
        </TouchableOpacity>
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
          <Text className="text-echo-muted text-sm">Report a User</Text>
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
          <Text className="text-echo-muted text-sm">Block a User</Text>
        </TouchableOpacity>
      </Section>

      {/* Legal */}
      <Section title="Legal">
        <TouchableOpacity
          onPress={() => Linking.openURL("https://wave-app.com/privacy")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Privacy Policy</Text>
          <Text className="text-echo-muted text-xs">&rsaquo;</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL("https://wave-app.com/terms")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Terms of Service</Text>
          <Text className="text-echo-muted text-xs">&rsaquo;</Text>
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
                    await echoBleManager.stop();
                    await signOut();
                    router.replace("/");
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
          <Text className="text-echo-danger text-sm">Delete Account</Text>
        </TouchableOpacity>
        <Text className="text-echo-muted text-xs mt-1">
          Permanently removes your account, matches, and all data.
        </Text>
      </Section>

      {/* App info */}
      <View className="items-center mt-4 mb-12">
        <Text className="text-echo-muted text-xs">
          Wave v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </View>
    </ScrollView>

    {/* Toast */}
    <Toast message={toastMessage} variant={toastVariant} onDismiss={() => setToastMessage(null)} />
    </>
  );
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
      <Text className="text-echo-muted text-xs uppercase tracking-wider mb-2">
        {title}
      </Text>
      <View className="bg-echo-surface rounded-2xl p-4">{children}</View>
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
      <Text className="text-echo-muted text-sm">{label}</Text>
      <Text
        className={`text-sm font-mono ${isError ? "text-echo-danger" : "text-white"}`}
        numberOfLines={1}
        style={{ maxWidth: 180 }}
      >
        {value}
      </Text>
    </View>
  );
}
