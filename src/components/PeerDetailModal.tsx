import { View, Text, TouchableOpacity, Modal, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useWaveStore } from "@/stores/waveStore";
import type { NearbyPeer, DistanceZone } from "@/types";
import { getDistanceZone, getSignalLabel, getAvatarForToken, getTimeSince } from "@/types";

const ZONE_CONFIG: Record<DistanceZone, { label: string; color: string }> = {
  HERE: { label: "Right Here", color: "text-green-400" },
  CLOSE: { label: "Close By", color: "text-blue-400" },
  NEARBY: { label: "Nearby", color: "text-wave-muted" },
};

export function PeerDetailModal({
  peer,
  onClose,
}: {
  peer: NearbyPeer;
  onClose: () => void;
}) {
  const router = useRouter();
  const avatar = getAvatarForToken(peer.ephemeralToken);
  const signal = getSignalLabel(peer.rssi);
  const zone = getDistanceZone(peer.rssi);
  const zoneLabel = ZONE_CONFIG[zone].label;
  const zoneColor = ZONE_CONFIG[zone].color;
  const freshness = getTimeSince(peer.lastSeen);
  const isMatched = useWaveStore((s) => s.matchedTokens.has(peer.ephemeralToken));
  const instagramHandle = useWaveStore((s) => s.matchedHandles.get(peer.ephemeralToken));

  const openInstagram = () => {
    if (!instagramHandle) return;
    Linking.openURL(`instagram://user?username=${instagramHandle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${instagramHandle}`).catch(() => {});
    });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/60 justify-end">
        <Pressable onPress={(e) => e.stopPropagation()} className="bg-wave-surface rounded-t-3xl px-6 pt-6 pb-10">
          {/* Handle bar */}
          <View className="w-10 h-1 rounded-full bg-wave-muted/40 self-center mb-5" />

          {/* Avatar + Note */}
          <View className="items-center mb-4">
            <View
              className={`w-14 h-14 rounded-full items-center justify-center mb-3 ${
                isMatched ? "bg-pink-500/20 border-2 border-pink-500/40" : `${avatar.bg} border-2 ${avatar.ring}`
              }`}
            >
              <Text className="text-2xl">{isMatched ? "✨" : avatar.emoji}</Text>
            </View>
            <Text className="text-white text-lg font-semibold text-center px-4">
              {peer.note || "Someone"}
            </Text>
            {isMatched && (
              <View className="bg-wave-match/20 rounded-full px-3 py-1 mt-2">
                <Text className="text-wave-match text-xs font-semibold">Matched</Text>
              </View>
            )}
          </View>

          {/* Instagram handle (if matched) */}
          {isMatched && instagramHandle && (
            <TouchableOpacity
              onPress={openInstagram}
              className="bg-wave-bg rounded-xl px-4 py-3 mb-4 flex-row items-center justify-between"
            >
              <Text className="text-wave-muted text-sm">Instagram</Text>
              <Text className="text-wave-accent text-sm font-semibold">@{instagramHandle}</Text>
            </TouchableOpacity>
          )}

          {/* Details */}
          <View className="bg-wave-bg rounded-xl px-4 py-3 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-wave-muted text-sm">Distance</Text>
              <Text className={`text-sm font-medium ${zoneColor}`}>{zoneLabel}</Text>
            </View>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-wave-muted text-sm">Signal</Text>
              <Text className="text-white text-sm">{signal}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-wave-muted text-sm">Last seen</Text>
              <Text className="text-white text-sm">{freshness}</Text>
            </View>
          </View>

          {/* View Matches (if matched) */}
          {isMatched && (
            <TouchableOpacity
              onPress={() => { onClose(); router.push("/(main)/history"); }}
              className="bg-wave-primary rounded-xl py-3 items-center mb-3"
            >
              <Text className="text-white text-sm font-semibold">View All Matches</Text>
            </TouchableOpacity>
          )}

          {/* Close */}
          <TouchableOpacity onPress={onClose} className="bg-wave-bg rounded-xl py-3 items-center">
            <Text className="text-white text-sm font-semibold">Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
