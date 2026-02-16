import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator, Modal, Animated, Linking } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { useAuthStore } from "@/stores/authStore";
import { saveInstagramHandle } from "@/services/profile";
import { supabase } from "@/services/supabase";
import { echoBleManager } from "@/services/ble/bleManager";
import { impactLight } from "@/utils/haptics";

export default function SettingsScreen() {
  const {
    adapterState,
    isScanning,
    isAdvertising,
    permissionStatus,
    nearbyPeers,
    error,
  } = useBleStore();
  const { currentToken, tokenExpiresAt, matches } = useEchoStore();
  const { userId, instagramHandle, setInstagramHandle } = useAuthStore();
  const router = useRouter();

  const [editingHandle, setEditingHandle] = useState(false);
  const [handleInput, setHandleInput] = useState(instagramHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tokenExpiry = tokenExpiresAt
    ? new Date(tokenExpiresAt).toLocaleTimeString()
    : "N/A";

  const handleSaveHandle = async () => {
    const cleaned = handleInput.trim().toLowerCase().replace(/^@/, "");
    if (!cleaned || !/^(?=.*[a-z0-9])[a-z0-9._]{1,30}$/.test(cleaned)) {
      Alert.alert("Invalid Username", "Enter a valid Instagram username.");
      return;
    }

    setSaving(true);
    const saved = await saveInstagramHandle(cleaned);
    setSaving(false);

    if (saved) {
      impactLight();
      setInstagramHandle(saved);
      setEditingHandle(false);
      setToast("Username updated!");
    } else {
      Alert.alert("Error", "Could not save. Username may already be taken.");
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

      {/* Toast notification */}
      <Toast message={toast} onDone={() => setToast(null)} />

    <ScrollView className="flex-1 bg-echo-bg pt-16 px-4">
      {/* Header */}
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">Settings</Text>
      </View>

      {/* Account */}
      <Section title="Account">
        <InfoRow label="User ID" value={userId ? userId.substring(0, 12) + "..." : "Not authenticated"} />
        <InfoRow label="Mode" value="Anonymous" />
      </Section>

      {/* Instagram */}
      <Section title="Instagram">
        {editingHandle ? (
          <View>
            <View className="flex-row items-center py-1.5">
              <Text className="text-echo-muted text-sm mr-1">@</Text>
              <TextInput
                className="flex-1 text-white text-sm"
                value={handleInput}
                onChangeText={setHandleInput}
                placeholder="username"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
              />
            </View>
            <View className="flex-row justify-end gap-3 mt-2">
              <TouchableOpacity
                onPress={() => {
                  setEditingHandle(false);
                  setHandleInput(instagramHandle ?? "");
                }}
                className="py-2 px-4"
              >
                <Text className="text-echo-muted text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveHandle}
                disabled={saving}
                className="py-2 px-4 bg-echo-primary rounded-lg"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setHandleInput(instagramHandle ?? "");
              setEditingHandle(true);
            }}
            className="flex-row justify-between items-center py-1.5"
          >
            <Text className="text-echo-muted text-sm">Handle</Text>
            <Text className="text-white text-sm">
              {instagramHandle ? `@${instagramHandle}` : "Not set"}{" "}
              <Text className="text-echo-primary">Edit</Text>
            </Text>
          </TouchableOpacity>
        )}
      </Section>

      {/* Bluetooth */}
      <Section title="Bluetooth">
        <InfoRow label="Status" value={adapterState} />
        <InfoRow label="Scanning" value={isScanning ? "Active" : "Off"} />
        <InfoRow label="Broadcasting" value={isAdvertising ? "Active" : "Off"} />
        <InfoRow label="Permission" value={permissionStatus} />
        <InfoRow label="Nearby" value={String(nearbyPeers.size)} />
        {error && <InfoRow label="Error" value={error} isError />}
      </Section>

      {/* Echo Protocol */}
      <Section title="Echo Protocol">
        <InfoRow
          label="Token"
          value={currentToken ? currentToken.substring(0, 12) + "..." : "None"}
        />
        <InfoRow label="Expires" value={tokenExpiry} />
        <InfoRow label="Matches" value={String(matches.length)} />
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
                  onPress: () => Linking.openURL("mailto:support@echo-app.com?subject=Report%20User"),
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
          onPress={() => Linking.openURL("https://echo-app.com/privacy")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Privacy Policy</Text>
          <Text className="text-echo-muted text-xs">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL("https://echo-app.com/terms")}
          className="py-3 flex-row justify-between items-center"
        >
          <Text className="text-white text-sm">Terms of Service</Text>
          <Text className="text-echo-muted text-xs">›</Text>
        </TouchableOpacity>
      </Section>

      {/* Danger zone */}
      <Section title="Account Actions">
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
          Echo v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
        <Text className="text-echo-muted text-xs mt-1">
          Built with 💜 using BLE
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

/** Animated toast that auto-dismisses after 2s */
function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (message) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => onDoneRef.current());
    }
  }, [message, opacity]);

  if (!message) return null;

  return (
    <Animated.View
      style={{ opacity }}
      className="absolute top-16 left-6 right-6 z-50 bg-echo-primary rounded-xl py-3 px-4 items-center"
    >
      <Text className="text-white text-sm font-semibold">{message}</Text>
    </Animated.View>
  );
}
