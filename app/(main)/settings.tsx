import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, Linking, TextInput } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { useAuthStore } from "@/stores/authStore";
import { signOut } from "@/services/auth";
import { saveInstagramHandle } from "@/services/profile";
import { supabase } from "@/services/supabase";
import { echoBleManager } from "@/services/ble/bleManager";
import { impactLight } from "@/utils/haptics";

export default function SettingsScreen() {
  const { userId, instagramHandle, setInstagramHandle } = useAuthStore();
  const router = useRouter();

  const [deleting, setDeleting] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState(instagramHandle ?? "");
  const [savingHandle, setSavingHandle] = useState(false);

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
    } else {
      Alert.alert(
        "Invalid Username",
        "Please enter a valid Instagram username (letters, numbers, dots, and underscores).",
      );
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
          onPress: () => useEchoStore.getState().clearMatches(),
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
                Alert.alert("Error", "Not signed in. Please restart the app.");
                return;
              }

              const { error } = await supabase.functions.invoke("delete-account", {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });

              if (error) {
                setDeleting(false);
                Alert.alert("Error", "Failed to delete account. Please try again.");
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
              Alert.alert("Error", "Something went wrong. Please try again.");
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
                <Text className="text-echo-primary text-xs">Edit</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        <Text className="text-echo-muted text-xs mt-2 leading-4">
          Shown to you and your match after a mutual wave.
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
          <Text className="text-echo-muted text-xs">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL("https://wave-app.com/terms")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Terms of Service</Text>
          <Text className="text-echo-muted text-xs">›</Text>
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
