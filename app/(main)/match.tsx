import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Linking, Dimensions, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { notifySuccess } from "@/utils/haptics";
import { playMatchChime } from "@/utils/sound";
import { useWaveStore } from "@/stores/waveStore";
import { supabase } from "@/services/supabase";
import { logger } from "@/utils/logger";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = [
  "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
  "#FF6BFF", "#FFB86B", "#6BFFD9", "#C56BFF",
];

const MATCH_MILESTONES = [1, 5, 10, 25, 50, 100];

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  delay: number;
  rotation: number;
  drift: number;
}

export default function MatchScreen() {
  const router = useRouter();
  const latestUnseenMatch = useWaveStore((s) => s.latestUnseenMatch);
  const markMatchSeen = useWaveStore((s) => s.markMatchSeen);

  // Snapshot the match on mount so it doesn't disappear mid-celebration
  // if the other user removes the match (L14 fix)
  const matchSnapshot = useRef(latestUnseenMatch);
  if (latestUnseenMatch && latestUnseenMatch !== matchSnapshot.current) {
    matchSnapshot.current = latestUnseenMatch;
  }
  const displayMatch = matchSnapshot.current;

  useEffect(() => {
    notifySuccess();
    playMatchChime();
  }, []);

  useEffect(() => {
    if (!displayMatch) {
      router.replace("/(main)/radar");
    }
  }, [displayMatch, router]);

  const handle = displayMatch?.instagramHandle;

  // If the handle hasn't arrived yet (Realtime RPC in-flight), retry fetching it
  // directly via RPC with timeout. Resolves when handle arrives from store update
  // or after retries exhausted (~8s total).
  const [handleLoading, setHandleLoading] = useState(!handle);
  useEffect(() => {
    if (handle) {
      setHandleLoading(false);
      return;
    }
    if (!displayMatch) return;

    let cancelled = false;
    const retryFetchHandle = async () => {
      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 2_500;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (cancelled) return;

        // Check if store was updated by Realtime while we waited
        const storeHandle = useWaveStore.getState().matches
          .find((m) => m.matchId === displayMatch.matchId)?.instagramHandle;
        if (storeHandle) {
          useWaveStore.getState().updateMatchHandle(displayMatch.matchId, storeHandle);
          if (!cancelled) setHandleLoading(false);
          return;
        }

        // Direct RPC fetch
        try {
          const { data } = await supabase.rpc("get_matched_instagram_handles", {
            p_match_ids: [displayMatch.matchId],
          });

          if (!cancelled && data?.[0]?.instagram_handle) {
            useWaveStore.getState().updateMatchHandle(
              displayMatch.matchId,
              data[0].instagram_handle,
            );
            setHandleLoading(false);
            return;
          }
        } catch {
          // Timeout or network error — retry
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }

      if (!cancelled) {
        logger.wave("Match handle retry exhausted — no handle found", {
          matchId: displayMatch.matchId,
        });
        setHandleLoading(false);
      }
    };

    retryFetchHandle();
    return () => { cancelled = true; };
  }, [handle, displayMatch]);

  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * SCREEN_W,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 600,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
    }));
  }, []);

  const matchCount = useWaveStore((s) => s.matches.length);

  const milestone = MATCH_MILESTONES.includes(matchCount)
    ? matchCount === 1
      ? "Your first match!"
      : `${matchCount} matches!`
    : null;

  if (!displayMatch) return null;

  const openInstagram = () => {
    if (!handle) return;
    Linking.openURL(`instagram://user?username=${handle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${handle}`).catch(() => {});
    });
  };

  const handleDismiss = () => {
    if (displayMatch) {
      markMatchSeen(displayMatch.matchId);
    }
    router.replace("/(main)/radar");
  };

  return (
    <View className="flex-1 bg-wave-bg items-center justify-center px-8">
      {/* Confetti */}
      {confettiPieces.map((piece) => (
        <ConfettiParticle key={piece.id} piece={piece} />
      ))}

      {/* Celebration visual */}
      <View className="w-32 h-32 rounded-full bg-wave-match/20 items-center justify-center mb-8">
        <View className="w-24 h-24 rounded-full bg-wave-match/40 items-center justify-center">
          <View className="w-16 h-16 rounded-full bg-wave-match items-center justify-center">
            <Text className="text-4xl">🎉</Text>
          </View>
        </View>
      </View>

      {/* Match text */}
      <Text className="text-4xl font-bold text-white mb-2">It's a Match!</Text>
      <Text className="text-wave-muted text-center text-base mb-4">
        You both waved at each other
      </Text>

      {/* Milestone badge */}
      {milestone && (
        <View className="bg-wave-primary/20 rounded-full px-4 py-1.5 -mt-1 mb-3">
          <Text className="text-wave-primary text-sm font-semibold">{milestone}</Text>
        </View>
      )}

      {/* Instagram handle */}
      {handle ? (
        <TouchableOpacity onPress={openInstagram} className="mb-8">
          <Text className="text-wave-accent text-xl font-semibold">
            @{handle}
          </Text>
        </TouchableOpacity>
      ) : handleLoading ? (
        <View className="mb-8 flex-row items-center">
          <ActivityIndicator size="small" color="#666680" />
          <Text className="text-wave-muted text-sm ml-2">
            Loading Instagram...
          </Text>
        </View>
      ) : (
        <Text className="text-wave-muted text-sm mb-8">
          No Instagram linked
        </Text>
      )}

      {/* Open Instagram button */}
      {handle && (
        <TouchableOpacity
          onPress={openInstagram}
          className="bg-wave-match py-4 px-12 rounded-2xl mb-4 flex-row items-center"
        >
          <Text className="text-white text-lg font-semibold">
            Open in Instagram
          </Text>
        </TouchableOpacity>
      )}

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={handleDismiss}
        className={`py-4 px-12 rounded-2xl ${handle ? "bg-wave-surface" : "bg-wave-primary"}`}
      >
        <Text className="text-white text-lg font-semibold">
          Back to Radar
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ─── Confetti Particle ─────────────────────────────────────── */

function ConfettiParticle({ piece }: { piece: ConfettiPiece }) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      piece.delay,
      withTiming(SCREEN_H + 40, {
        duration: 2200 + Math.random() * 800,
        easing: Easing.in(Easing.quad),
      }),
    );
    opacity.value = withDelay(
      piece.delay + 1800,
      withTiming(0, { duration: 600 }),
    );
    rotate.value = withDelay(
      piece.delay,
      withTiming(piece.rotation + 720, {
        duration: 2600,
        easing: Easing.linear,
      }),
    );
  }, [piece, translateY, opacity, rotate]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: piece.drift },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -20,
          left: piece.x,
          width: piece.size,
          height: piece.size * 1.4,
          backgroundColor: piece.color,
          borderRadius: 2,
        },
        style,
      ]}
    />
  );
}
