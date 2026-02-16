import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { useAuthStore } from "@/stores/authStore";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    adapterState,
    isScanning,
    isAdvertising,
    permissionStatus,
    nearbyPeers,
    error,
  } = useBleStore();
  const { currentToken, tokenExpiresAt, matches } = useEchoStore();
  const { userId } = useAuthStore();

  const tokenExpiry = tokenExpiresAt
    ? new Date(tokenExpiresAt).toLocaleTimeString()
    : "N/A";

  return (
    <ScrollView className="flex-1 bg-echo-bg pt-16 px-4">
      {/* Header */}
      <View className="flex-row items-center mb-6">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Text className="text-echo-primary text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-white">Debug Info</Text>
      </View>

      {/* Auth section */}
      <Section title="Authentication">
        <InfoRow label="User ID" value={userId ?? "Not authenticated"} />
      </Section>

      {/* BLE section */}
      <Section title="Bluetooth">
        <InfoRow label="Adapter State" value={adapterState} />
        <InfoRow label="Scanning" value={isScanning ? "Yes" : "No"} />
        <InfoRow label="Advertising" value={isAdvertising ? "Yes" : "No"} />
        <InfoRow label="Permission" value={permissionStatus} />
        <InfoRow label="Nearby Peers" value={String(nearbyPeers.size)} />
        {error && <InfoRow label="Error" value={error} isError />}
      </Section>

      {/* Echo Protocol section */}
      <Section title="Echo Protocol">
        <InfoRow
          label="Current Token"
          value={currentToken ? currentToken.substring(0, 12) + "..." : "None"}
        />
        <InfoRow label="Token Expires" value={tokenExpiry} />
        <InfoRow label="Total Matches" value={String(matches.length)} />
      </Section>

      {/* Nearby peers detail */}
      {nearbyPeers.size > 0 && (
        <Section title="Nearby Peers">
          {Array.from(nearbyPeers.values()).map((peer) => (
            <View
              key={peer.ephemeralToken}
              className="bg-echo-surface p-3 rounded-xl mb-2"
            >
              <Text className="text-white text-sm font-mono">
                Token: {peer.ephemeralToken.substring(0, 12)}...
              </Text>
              <Text className="text-echo-muted text-xs">
                RSSI: {peer.rssi} dBm | Last seen:{" "}
                {new Date(peer.lastSeen).toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </Section>
      )}

      <View className="h-12" />
    </ScrollView>
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
