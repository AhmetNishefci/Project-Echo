import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, Linking, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { notifySuccess } from "@/utils/haptics";
import { useEchoStore } from "@/stores/echoStore";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = [
  "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
  "#FF6BFF", "#FFB86B", "#6BFFD9", "#C56BFF",
];

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
  const latestUnseenMatch = useEchoStore((s) => s.latestUnseenMatch);
  const markMatchSeen = useEchoStore((s) => s.markMatchSeen);

  useEffect(() => {
    notifySuccess();
  }, []);

  useEffect(() => {
    if (!latestUnseenMatch) {
      router.back();
    }
  }, [latestUnseenMatch, router]);

  const handle = latestUnseenMatch?.instagramHandle;

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

  if (!latestUnseenMatch) return null;

  const openInstagram = () => {
    if (!handle) return;
    Linking.openURL(`instagram://user?username=${handle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${handle}`);
    });
  };

  const handleDismiss = () => {
    if (latestUnseenMatch) {
      markMatchSeen(latestUnseenMatch.matchId);
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-echo-bg items-center justify-center px-8">
      {/* Confetti */}
      {confettiPieces.map((piece) => (
        <ConfettiParticle key={piece.id} piece={piece} />
      ))}

      {/* Celebration visual */}
      <View className="w-32 h-32 rounded-full bg-echo-match/20 items-center justify-center mb-8">
        <View className="w-24 h-24 rounded-full bg-echo-match/40 items-center justify-center">
          <View className="w-16 h-16 rounded-full bg-echo-match items-center justify-center">
            <Text className="text-4xl">🎉</Text>
          </View>
        </View>
      </View>

      {/* Match text */}
      <Text className="text-4xl font-bold text-white mb-2">It's a Match!</Text>
      <Text className="text-echo-muted text-center text-base mb-4">
        You both waved at each other
      </Text>

      {/* Instagram handle */}
      {handle ? (
        <TouchableOpacity onPress={openInstagram} className="mb-8">
          <Text className="text-echo-accent text-xl font-semibold">
            @{handle}
          </Text>
        </TouchableOpacity>
      ) : (
        <Text className="text-echo-muted text-sm mb-8">
          No Instagram linked
        </Text>
      )}

      {/* Open Instagram button */}
      {handle && (
        <TouchableOpacity
          onPress={openInstagram}
          className="bg-echo-match py-4 px-12 rounded-2xl mb-4 flex-row items-center"
        >
          <Text className="text-white text-lg font-semibold">
            Open in Instagram
          </Text>
        </TouchableOpacity>
      )}

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={handleDismiss}
        className={`py-4 px-12 rounded-2xl ${handle ? "bg-echo-surface" : "bg-echo-primary"}`}
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
