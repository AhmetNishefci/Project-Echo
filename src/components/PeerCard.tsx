import { View, Text, TouchableOpacity } from "react-native";
import type { NearbyPeer } from "@/types";

interface PeerCardProps {
  peer: NearbyPeer;
  onWave: () => void;
  hasWaved: boolean;
}

/**
 * Get signal strength indicator based on RSSI value.
 * Zone 1 (Strong): -40 to -65 dBm
 * Zone 2 (Medium): -66 to -80 dBm
 * Zone 3 (Weak): < -80 dBm
 */
function getSignalInfo(rssi: number): {
  label: string;
  bars: number;
  color: string;
} {
  if (rssi >= -65) {
    return { label: "Here", bars: 3, color: "text-echo-accent" };
  }
  if (rssi >= -80) {
    return { label: "Nearby", bars: 2, color: "text-echo-wave" };
  }
  return { label: "Far", bars: 1, color: "text-echo-muted" };
}

export function PeerCard({ peer, onWave, hasWaved }: PeerCardProps) {
  const signal = getSignalInfo(peer.rssi);
  const shortToken = peer.ephemeralToken.substring(0, 8).toUpperCase();

  return (
    <View className="bg-echo-surface rounded-2xl p-4 mb-3 flex-row items-center">
      {/* Avatar placeholder */}
      <View className="w-12 h-12 rounded-full bg-echo-primary/30 items-center justify-center mr-4">
        <Text className="text-echo-primary text-lg font-bold">
          {shortToken.substring(0, 2)}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">
          Echo #{shortToken}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className={`text-sm ${signal.color}`}>{signal.label}</Text>
          <Text className="text-echo-muted text-xs ml-2">
            {peer.rssi} dBm
          </Text>
        </View>
      </View>

      {/* Wave button */}
      <TouchableOpacity
        onPress={onWave}
        disabled={hasWaved}
        className={`py-2 px-5 rounded-xl ${
          hasWaved ? "bg-echo-surface border border-echo-muted" : "bg-echo-wave"
        }`}
      >
        <Text
          className={`font-semibold ${hasWaved ? "text-echo-muted" : "text-white"}`}
        >
          {hasWaved ? "Waved!" : "Wave"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
