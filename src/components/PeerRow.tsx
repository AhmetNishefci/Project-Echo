import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, Pressable } from "react-native";
import { useWaveStore } from "@/stores/waveStore";
import type { NearbyPeer } from "@/types";
import { getAvatarForToken, getTimeSince } from "@/types";
import { WAVE_EXPIRY_MINUTES } from "@/services/ble/constants";

const WAVE_EXPIRY_MS = WAVE_EXPIRY_MINUTES * 60 * 1_000;

export function PeerRow({
  peer,
  onWave,
  onUndo,
  onPress,
  isOffline,
}: {
  peer: NearbyPeer;
  onWave: (p: NearbyPeer) => void;
  onUndo: (token: string) => void;
  onPress: (p: NearbyPeer) => void;
  isOffline: boolean;
}) {
  const wavePending = useWaveStore(
    (s) => s.pendingWaves.get(peer.ephemeralToken) ?? null,
  );
  const isAlreadyMatched = useWaveStore(
    (s) => s.matchedTokens.has(peer.ephemeralToken),
  );
  const hasWavedAtMe = useWaveStore(
    (s) => s.incomingWaveTokens.includes(peer.ephemeralToken),
  );
  const avatar = useMemo(
    () => getAvatarForToken(peer.ephemeralToken),
    [peer.ephemeralToken],
  );
  const freshness = getTimeSince(peer.lastSeen);

  // Auto-expire wave after 15 minutes — revert button to Wave
  useEffect(() => {
    if (!wavePending) return;

    const elapsed = Date.now() - wavePending.sentAt;
    if (elapsed >= WAVE_EXPIRY_MS) {
      useWaveStore.getState().removePendingWave(peer.ephemeralToken);
      return;
    }

    const timer = setTimeout(() => {
      useWaveStore.getState().removePendingWave(peer.ephemeralToken);
    }, WAVE_EXPIRY_MS - elapsed);

    return () => clearTimeout(timer);
  }, [wavePending, peer.ephemeralToken]);

  return (
    <View
      className={`py-3 px-4 mb-2 rounded-xl flex-row items-center ${
        isAlreadyMatched
          ? "bg-pink-500/10 border border-pink-500/20"
          : hasWavedAtMe
            ? "bg-green-500/10 border border-green-500/20"
            : "bg-wave-surface"
      }`}
    >
      {/* Tappable area: avatar + info */}
      <Pressable onPress={() => onPress(peer)} className="flex-row items-center flex-1 mr-3">
        {/* Avatar */}
        <View
          className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
            isAlreadyMatched ? "bg-pink-500/20 border-2 border-pink-500/40" : `${avatar.bg} border-2 ${avatar.ring}`
          }`}
        >
          <Text className="text-lg">{isAlreadyMatched ? "✨" : avatar.emoji}</Text>
        </View>

        {/* Info */}
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-white text-base flex-shrink" numberOfLines={1}>
              {peer.note || "Someone"}
            </Text>
            {isAlreadyMatched ? (
              <Text className="text-pink-400 text-xs ml-2">matched!</Text>
            ) : hasWavedAtMe ? (
              <Text className="text-green-400 text-xs ml-2">waved at you</Text>
            ) : wavePending ? (
              <Text className="text-orange-400/60 text-xs ml-2">waiting for wave back</Text>
            ) : null}
          </View>
          <Text className="text-wave-muted text-xs">{freshness}</Text>
        </View>
      </Pressable>

      {/* Wave / Undo / Matched */}
      {isAlreadyMatched ? (
        <TouchableOpacity
          onPress={() => onPress(peer)}
          className="bg-wave-match/20 border border-wave-match/40 rounded-lg px-3 py-1.5"
        >
          <Text className="text-wave-match font-semibold text-sm">
            Matched 🤝
          </Text>
        </TouchableOpacity>
      ) : wavePending ? (
        <TouchableOpacity
          onPress={() => onUndo(peer.ephemeralToken)}
          className="bg-orange-500/20 border border-orange-500/40 rounded-lg px-3 py-1.5"
        >
          <Text className="text-orange-400 font-semibold text-sm">Undo</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => onWave(peer)}
          disabled={isOffline}
          className={`rounded-lg px-3 py-1.5 ${
            isOffline
              ? "bg-wave-muted/10 border border-wave-muted/20"
              : hasWavedAtMe
                ? "bg-green-500/20 border border-green-500/40"
                : "bg-wave-wave/20 border border-wave-wave/40"
          }`}
        >
          <Text
            className={`font-semibold text-sm ${
              isOffline
                ? "text-wave-muted"
                : hasWavedAtMe ? "text-green-400" : "text-wave-wave"
            }`}
          >
            {hasWavedAtMe ? "Wave Back 👋" : "Wave 👋"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
