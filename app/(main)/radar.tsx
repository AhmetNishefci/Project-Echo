import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { impactMedium, impactLight, notifySuccess, notifyError } from "@/utils/haptics";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { echoBleManager } from "@/services/ble/bleManager";
import { sendWave, undoWave } from "@/services/echo/waves";
import { PermissionGate } from "@/components/PermissionGate";
import { BleStatusBar } from "@/components/StatusBar";
import type { NearbyPeer, DistanceZone } from "@/types";
import { getDistanceZone, getSignalLabel, getAvatarForToken, getTimeSince } from "@/types";
import { logger } from "@/utils/logger";
import { WAVE_EXPIRY_MINUTES } from "@/services/ble/constants";

const ZONE_CONFIG: Record<DistanceZone, { label: string; color: string }> = {
  HERE: { label: "Right Here", color: "text-green-400" },
  CLOSE: { label: "Close By", color: "text-blue-400" },
  NEARBY: { label: "Nearby", color: "text-echo-muted" },
};

interface ZoneSection {
  zone: DistanceZone;
  title: string;
  color: string;
  data: NearbyPeer[];
}

export default function RadarScreen() {
  const router = useRouter();
  const {
    adapterState,
    isScanning,
    isDiscoveryActive,
    isAdvertising,
    permissionStatus,
    nearbyPeers,
    error,
  } = useBleStore();
  const { currentToken, isRotating } = useEchoStore();
  const incomingWaveTokens = useEchoStore((s) => s.incomingWaveTokens);
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sections = useMemo<ZoneSection[]>(() => {
    const peers = Array.from(nearbyPeers.values());
    const groups: Record<DistanceZone, NearbyPeer[]> = {
      HERE: [],
      CLOSE: [],
      NEARBY: [],
    };

    for (const peer of peers) {
      const zone = getDistanceZone(peer.rssi);
      groups[zone].push(peer);
    }

    // Sort within each zone by RSSI (strongest first)
    for (const zone of Object.keys(groups) as DistanceZone[]) {
      groups[zone].sort((a, b) => b.rssi - a.rssi);
    }

    const order: DistanceZone[] = ["HERE", "CLOSE", "NEARBY"];
    return order
      .filter((zone) => groups[zone].length > 0)
      .map((zone) => ({
        zone,
        title: ZONE_CONFIG[zone].label,
        color: ZONE_CONFIG[zone].color,
        data: groups[zone],
      }));
  }, [nearbyPeers]);

  const totalPeers = useMemo(
    () => Array.from(nearbyPeers.values()).length,
    [nearbyPeers],
  );

  const showToast = useCallback((message: string, durationMs = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleStartDiscovery = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const result = await echoBleManager.requestPermissions();
      if (result !== "granted") {
        Alert.alert(
          "Permissions Required",
          "Echo needs Bluetooth permissions to discover nearby people.",
        );
        return;
      }

      let token = useEchoStore.getState().currentToken;
      if (!token) {
        for (let i = 0; i < 16; i++) {
          await new Promise((r) => setTimeout(r, 500));
          token = useEchoStore.getState().currentToken;
          if (token) break;
        }
      }

      if (!token) {
        Alert.alert(
          "Connection Issue",
          "Could not connect to the server. Check your internet and try again.",
        );
        return;
      }

      await echoBleManager.start();
      impactLight();
    } catch (err) {
      logger.error("Failed to start discovery", err);
      Alert.alert("Error", "Failed to start Bluetooth discovery.");
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, []);

  const handleStopDiscovery = useCallback(async () => {
    await echoBleManager.stop();
  }, []);

  const handleWave = useCallback(async (peer: NearbyPeer) => {
    const store = useEchoStore.getState();
    if (store.hasPendingWaveTo(peer.ephemeralToken)) return;

    impactMedium();
    store.addPendingWave(peer.ephemeralToken);

    logger.echo("Sending wave to peer", {
      token: peer.ephemeralToken.substring(0, 8),
    });

    const result = await sendWave(peer.ephemeralToken);

    if (result === "error") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      Alert.alert("Wave Failed", "Could not send wave. Try again.");
    } else if (result === "already_matched") {
      store.removePendingWave(peer.ephemeralToken);
      store.addMatchedToken(peer.ephemeralToken);
      showToast("You've already matched with this person! 🤝", 3000);
    } else if (result === "rate_limited") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      Alert.alert("Slow Down", "You're waving too fast. Wait a moment and try again.");
    } else if (result === "match") {
      notifySuccess();
      logger.echo("Match from wave!");
    } else if (result === "pending") {
      showToast("Wave sent! You can undo anytime before it expires.");
    }
  }, [showToast]);

  const handleUndo = useCallback(async (targetToken: string) => {
    impactLight();
    const success = await undoWave(targetToken);
    if (success) {
      showToast("Wave undone", 2000);
    } else {
      notifyError();
      Alert.alert("Undo Failed", "Could not undo the wave. It may have already been matched or expired.");
    }
  }, [showToast]);

  const handleInvite = useCallback(async () => {
    try {
      await Share.share({
        message:
          "I'm using Echo to connect with people nearby! Download it and wave at me 👋",
      });
    } catch {
      // User cancelled share
    }
  }, []);

  const renderPeer = useCallback(
    ({ item }: { item: NearbyPeer }) => (
      <PeerRow peer={item} onWave={handleWave} onUndo={handleUndo} />
    ),
    [handleWave, handleUndo],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ZoneSection }) => (
      <View className="flex-row items-center mb-2 mt-4">
        <Text className={`text-lg font-bold ${section.color}`}>
          {section.title}
        </Text>
        <Text className="text-echo-muted text-sm ml-2">
          {section.data.length}{" "}
          {section.data.length === 1 ? "person" : "people"}
        </Text>
      </View>
    ),
    [],
  );

  // Show permission gate if not granted
  if (permissionStatus !== "granted" && !isDiscoveryActive) {
    return (
      <PermissionGate
        onRequestPermissions={handleStartDiscovery}
        isLoading={isStarting}
      />
    );
  }

  return (
    <View className="flex-1 bg-echo-bg pt-16 px-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-3xl font-bold text-white">Echo</Text>
          <Text className="text-echo-muted text-sm mt-1">
            {totalPeers > 0
              ? `${totalPeers} ${totalPeers === 1 ? "person" : "people"} nearby`
              : isDiscoveryActive
                ? "Searching for people nearby..."
                : "Start scanning to find people"}
          </Text>
        </View>
      </View>

      {/* Status bar */}
      <BleStatusBar
        adapterState={adapterState}
        isScanning={isScanning}
        isAdvertising={isAdvertising}
        error={error}
      />

      {/* Incoming wave banner */}
      {incomingWaveTokens.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          className="bg-echo-wave/20 border border-echo-wave/40 rounded-2xl py-3 px-4 mb-4 flex-row items-center"
        >
          <Text className="text-2xl mr-3">👋</Text>
          <View className="flex-1">
            <Text className="text-white font-semibold text-sm">
              {incomingWaveTokens.length === 1
                ? "Someone nearby waved at you!"
                : `${incomingWaveTokens.length} people nearby waved at you!`}
            </Text>
            <Text className="text-echo-muted text-xs mt-0.5">
              Wave back to match and see their Instagram
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Start/Stop button */}
      {!isDiscoveryActive ? (
        <TouchableOpacity
          onPress={handleStartDiscovery}
          disabled={isStarting}
          className={`py-4 rounded-2xl items-center mb-4 ${isStarting ? "bg-echo-primary/70" : "bg-echo-primary"}`}
        >
          {isStarting ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-lg font-semibold ml-2">
                {currentToken ? "Starting..." : "Connecting..."}
              </Text>
            </View>
          ) : (
            <Text className="text-white text-lg font-semibold">
              Start Discovery
            </Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={handleStopDiscovery}
          className="bg-echo-surface py-4 rounded-2xl items-center mb-4 border border-echo-muted"
        >
          <Text className="text-echo-muted text-lg font-semibold">
            Stop Discovery
          </Text>
        </TouchableOpacity>
      )}

      {/* Distance zone sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.ephemeralToken}
        renderItem={renderPeer}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={{ paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          isDiscoveryActive ? (
            <View className="items-center mt-16">
              {/* Pulse animation */}
              <ScanPulse />

              <Text className="text-white text-base font-semibold mb-2 mt-6">
                Looking for people...
              </Text>
              <Text className="text-echo-muted text-sm text-center px-8 mb-8">
                Wave at someone nearby. If they wave back, you'll match and see
                each other's Instagram!
              </Text>

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={handleInvite}
                className="bg-echo-surface border border-echo-muted rounded-2xl py-3 px-6 flex-row items-center"
              >
                <Text className="text-lg mr-2">📲</Text>
                <Text className="text-white font-semibold text-sm">
                  Invite Friends Nearby
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="items-center mt-16">
              {/* Static radar icon (no pulse) */}
              <View className="w-36 h-36 items-center justify-center">
                <View className="absolute w-36 h-36 rounded-full border-2 border-indigo-500/15" />
                <View className="absolute w-24 h-24 rounded-full border-2 border-indigo-500/20" />
                <View className="w-16 h-16 rounded-full bg-echo-primary/20 items-center justify-center border-2 border-echo-primary/40">
                  <Text className="text-3xl">📡</Text>
                </View>
              </View>

              <Text className="text-white text-lg font-bold mb-2 mt-6">
                Discover People Nearby
              </Text>
              <Text className="text-echo-muted text-sm text-center px-8 leading-5">
                Tap <Text className="text-echo-primary font-semibold">Start Discovery</Text> to
                find people around you. Wave at someone — if they wave back,
                you'll match and see each other's Instagram.
              </Text>

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={handleInvite}
                className="bg-echo-surface border border-echo-muted rounded-2xl py-3 px-6 flex-row items-center mt-8"
              >
                <Text className="text-lg mr-2">📲</Text>
                <Text className="text-white font-semibold text-sm">
                  Invite Friends Nearby
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* Toast overlay */}
      {toast && (
        <Animated.View
          key={toast}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          className="absolute bottom-28 left-6 right-6 bg-echo-surface border border-echo-muted rounded-2xl py-3 px-4"
        >
          <Text className="text-white text-sm text-center">{toast}</Text>
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Scanning Pulse Animation ──────────────────────────────── */

function PulseRing({ delay }: { delay: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0, { duration: 2400, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );
  }, [delay, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: 70,
          borderWidth: 2,
          borderColor: "rgba(99, 102, 241, 0.35)",
        },
        animatedStyle,
      ]}
    />
  );
}

function ScanPulse() {
  return (
    <View className="w-36 h-36 items-center justify-center">
      <PulseRing delay={0} />
      <PulseRing delay={800} />
      <PulseRing delay={1600} />
      <View className="w-16 h-16 rounded-full bg-echo-primary/20 items-center justify-center border-2 border-echo-primary/40">
        <Text className="text-3xl">📡</Text>
      </View>
    </View>
  );
}

/* ─── Peer Row ──────────────────────────────────────────────── */

function PeerRow({
  peer,
  onWave,
  onUndo,
}: {
  peer: NearbyPeer;
  onWave: (p: NearbyPeer) => void;
  onUndo: (token: string) => void;
}) {
  const wavePending = useEchoStore(
    (s) => s.pendingWaves.get(peer.ephemeralToken) ?? null,
  );
  const isAlreadyMatched = useEchoStore(
    (s) => s.matchedTokens.has(peer.ephemeralToken),
  );
  const hasWavedAtMe = useEchoStore(
    (s) => s.incomingWaveTokens.includes(peer.ephemeralToken),
  );
  const signal = getSignalLabel(peer.rssi);
  const avatar = useMemo(
    () => getAvatarForToken(peer.ephemeralToken),
    [peer.ephemeralToken],
  );
  const freshness = getTimeSince(peer.lastSeen);

  // Auto-expire wave after 15 minutes — revert button to Wave 👋
  const WAVE_EXPIRY_MS = WAVE_EXPIRY_MINUTES * 60 * 1_000;

  useEffect(() => {
    if (!wavePending) return;

    const elapsed = Date.now() - wavePending.sentAt;
    if (elapsed >= WAVE_EXPIRY_MS) {
      // Already expired — clean up immediately
      useEchoStore.getState().removePendingWave(peer.ephemeralToken);
      return;
    }

    const timer = setTimeout(() => {
      useEchoStore.getState().removePendingWave(peer.ephemeralToken);
    }, WAVE_EXPIRY_MS - elapsed);

    return () => clearTimeout(timer);
  }, [wavePending, peer.ephemeralToken, WAVE_EXPIRY_MS]);

  return (
    <View className="py-3 px-4 mb-2 rounded-xl flex-row items-center bg-echo-surface">
      {/* Avatar */}
      <View
        className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${avatar.bg} border-2 ${avatar.ring}`}
      >
        <Text className="text-lg">{avatar.emoji}</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-white text-base">Someone</Text>
        <View className="flex-row items-center">
          <Text className="text-echo-muted text-xs">{signal}</Text>
          <Text className="text-echo-muted text-xs mx-1">·</Text>
          <Text className="text-echo-muted text-xs">{freshness}</Text>
        </View>
      </View>

      {/* Wave / Undo / Matched */}
      {isAlreadyMatched ? (
        <View className="bg-echo-match/20 rounded-lg px-3 py-1.5">
          <Text className="text-echo-match font-semibold text-sm">
            Matched 🤝
          </Text>
        </View>
      ) : wavePending ? (
        <TouchableOpacity
          onPress={() => onUndo(peer.ephemeralToken)}
          className="bg-orange-500/20 rounded-lg px-3 py-1.5"
        >
          <Text className="text-orange-400 font-semibold text-sm">Undo</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => onWave(peer)}
          className={`rounded-lg px-3 py-1.5 ${
            hasWavedAtMe
              ? "bg-green-500/20 border border-green-500/40"
              : "bg-echo-wave/20"
          }`}
        >
          <Text
            className={`font-semibold text-sm ${
              hasWavedAtMe ? "text-green-400" : "text-echo-wave"
            }`}
          >
            {hasWavedAtMe ? "Wave Back 👋" : "Wave 👋"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
