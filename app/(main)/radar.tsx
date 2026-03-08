import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  RefreshControl,
  Modal,
  Pressable,
  Linking,
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
import { useAuthStore } from "@/stores/authStore";
import { echoBleManager } from "@/services/ble/bleManager";
import { sendWave, undoWave } from "@/services/echo/waves";
import { PermissionGate } from "@/components/PermissionGate";
import { BleStatusBar } from "@/components/StatusBar";
import { Toast } from "@/components/Toast";
import type { NearbyPeer, DistanceZone } from "@/types";
import { getDistanceZone, getSignalLabel, getAvatarForToken, getTimeSince } from "@/types";
import { logger } from "@/utils/logger";
import { WAVE_EXPIRY_MINUTES } from "@/services/ble/constants";
import { playWaveSent } from "@/utils/sound";
import { useNoteResolver } from "@/hooks/useNoteResolver";
import { seedFakePeers, clearFakePeers } from "@/utils/seedPeers";
import { getCurrentLocation, updateLocationOnServer } from "@/services/location";
import { showPermissionBlockedAlert } from "@/services/ble/permissions";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const ZONE_CONFIG: Record<DistanceZone, { label: string; color: string }> = {
  HERE: { label: "Right Here", color: "text-green-400" },
  CLOSE: { label: "Close By", color: "text-blue-400" },
  NEARBY: { label: "Nearby", color: "text-echo-muted" },
};

const PEER_DISPLAY_CAP = 50;
const WAVE_EXPIRY_MS = WAVE_EXPIRY_MINUTES * 60 * 1_000;

interface ZoneSection {
  zone: DistanceZone;
  title: string;
  color: string;
  data: NearbyPeer[];
}

export default function RadarScreen() {
  const {
    adapterState,
    isScanning,
    isDiscoveryActive,
    isAdvertising,
    permissionStatus,
    nearbyPeers,
    error,
    proximityAlertPending,
  } = useBleStore();
  const { currentToken } = useEchoStore();
  const rawIncomingWaveTokens = useEchoStore((s) => s.incomingWaveTokens);
  const matchedTokens = useEchoStore((s) => s.matchedTokens);
  const genderPreference = useAuthStore((s) => s.genderPreference);
  const { isConnected } = useNetworkStatus();

  // Filter peers by gender preference before display
  const filteredPeers = useMemo(() => {
    if (!genderPreference || genderPreference === "both") {
      return nearbyPeers;
    }
    const filtered = new Map<string, NearbyPeer>();
    for (const [token, peer] of nearbyPeers) {
      // Show peers whose gender matches preference, or whose gender is unknown
      if (!peer.gender || peer.gender === genderPreference) {
        filtered.set(token, peer);
      }
    }
    return filtered;
  }, [nearbyPeers, genderPreference]);

  // Only count incoming waves from wavers still visible on the radar
  // AND matching gender preference (prevent phantom wave notifications).
  const incomingWaveTokens = useMemo(
    () => rawIncomingWaveTokens.filter((t) => filteredPeers.has(t)),
    [rawIncomingWaveTokens, filteredPeers],
  );
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<NearbyPeer | null>(null);
  const [showAllPeers, setShowAllPeers] = useState(false);

  // Resolve peer notes from server
  useNoteResolver(isDiscoveryActive);

  const handleRefresh = useCallback(async () => {
    if (!isDiscoveryActive) return;
    setRefreshing(true);
    // Restart scan cycle instead of clearing all peers — avoids jarring
    // empty list (M10 fix). Peers naturally repopulate as they're rediscovered.
    echoBleManager.restartScanCycle();
    // Brief pause so the user sees the refresh indicator
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  }, [isDiscoveryActive]);

  const sections = useMemo<ZoneSection[]>(() => {
    const peers = Array.from(filteredPeers.values());
    const groups: Record<DistanceZone, NearbyPeer[]> = {
      HERE: [],
      CLOSE: [],
      NEARBY: [],
    };

    for (const peer of peers) {
      const zone = getDistanceZone(peer.rssi);
      groups[zone].push(peer);
    }

    // Sort within each zone: incoming wavers first, matched second, then RSSI
    const incomingSet = new Set(rawIncomingWaveTokens);
    for (const zone of Object.keys(groups) as DistanceZone[]) {
      groups[zone].sort((a, b) => {
        const aPriority = incomingSet.has(a.ephemeralToken) ? 2
          : matchedTokens.has(a.ephemeralToken) ? 1 : 0;
        const bPriority = incomingSet.has(b.ephemeralToken) ? 2
          : matchedTokens.has(b.ephemeralToken) ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.rssi - a.rssi;
      });
    }

    const order: DistanceZone[] = ["HERE", "CLOSE", "NEARBY"];
    const allSections = order
      .filter((zone) => groups[zone].length > 0)
      .map((zone) => ({
        zone,
        title: ZONE_CONFIG[zone].label,
        color: ZONE_CONFIG[zone].color,
        data: groups[zone],
      }));

    // Apply peer cap: limit total displayed peers across all zones
    if (!showAllPeers) {
      let remaining = PEER_DISPLAY_CAP;
      for (const section of allSections) {
        if (remaining <= 0) {
          section.data = [];
        } else if (section.data.length > remaining) {
          section.data = section.data.slice(0, remaining);
          remaining = 0;
        } else {
          remaining -= section.data.length;
        }
      }
      return allSections.filter((s) => s.data.length > 0);
    }

    return allSections;
  }, [filteredPeers, showAllPeers, rawIncomingWaveTokens, matchedTokens]);

  const totalPeers = filteredPeers.size;

  const handleStartDiscovery = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    try {
      const result = await echoBleManager.requestPermissions();
      if (result === "blocked") {
        showPermissionBlockedAlert();
        return;
      }
      if (result !== "granted") {
        Alert.alert(
          "Permissions Required",
          "Wave needs Bluetooth permissions to discover nearby people.",
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

      // Send location to server for proximity notifications (non-blocking)
      const nearbyAlertsEnabled = useAuthStore.getState().nearbyAlertsEnabled;
      if (nearbyAlertsEnabled) {
        getCurrentLocation().then((loc) => {
          if (loc) {
            updateLocationOnServer(loc.latitude, loc.longitude).catch((err) =>
              logger.error("Location update failed (non-fatal)", err),
            );
          }
        });
      }
    } catch (err) {
      logger.error("Failed to start discovery", err);
      Alert.alert("Error", "Failed to start Bluetooth discovery.");
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }, []);

  // Auto-start discovery when opened from a proximity alert notification
  const [showProximityHint, setShowProximityHint] = useState(false);
  useEffect(() => {
    if (proximityAlertPending) {
      useBleStore.getState().setProximityAlertPending(false);
      setShowProximityHint(true);
      if (!isDiscoveryActive && !startingRef.current && permissionStatus === "granted") {
        handleStartDiscovery();
      }
    }
  }, [proximityAlertPending, isDiscoveryActive, permissionStatus, handleStartDiscovery]);

  // Clear the hint once peers appear
  useEffect(() => {
    if (showProximityHint && nearbyPeers.size > 0) {
      setShowProximityHint(false);
    }
  }, [showProximityHint, nearbyPeers]);

  const handleStopDiscovery = useCallback(async () => {
    await echoBleManager.stop();
  }, []);

  const handleWave = useCallback(async (peer: NearbyPeer) => {
    const store = useEchoStore.getState();
    if (store.hasPendingWaveTo(peer.ephemeralToken)) return;

    impactMedium();
    playWaveSent();
    store.addPendingWave(peer.ephemeralToken);

    logger.echo("Sending wave to peer", {
      token: peer.ephemeralToken.substring(0, 8),
    });

    const result = await sendWave(peer.ephemeralToken);

    if (result.status === "error") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      Alert.alert("Wave Failed", "Could not send wave. Try again.");
    } else if (result.status === "already_matched") {
      store.removePendingWave(peer.ephemeralToken);
      store.addMatchedToken(peer.ephemeralToken, result.match?.instagramHandle);
      setToast("You've already matched with this person!");
    } else if (result.status === "rate_limited") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      Alert.alert("Slow Down", "You're waving too fast. Wait a moment and try again.");
    } else if (result.status === "match") {
      store.removePendingWave(peer.ephemeralToken);
      store.addMatchedToken(peer.ephemeralToken, result.match?.instagramHandle);
      notifySuccess();
      logger.echo("Match from wave!");
    } else if (result.status === "pending") {
      // Store userId → token mapping so realtime match events can bridge to radar
      if (result.targetUserId) {
        store.setPendingWaveUser(result.targetUserId, peer.ephemeralToken);
      }
      setToast("Wave sent! You can undo anytime before it expires.");
    }
  }, []);

  const undoingRef = useRef<string | null>(null);
  const handleUndo = useCallback(async (targetToken: string) => {
    if (undoingRef.current === targetToken) return;
    undoingRef.current = targetToken;
    impactLight();
    const success = await undoWave(targetToken);
    undoingRef.current = null;
    if (success) {
      useEchoStore.getState().removePendingWaveByToken(targetToken);
      setToast("Wave undone");
    } else {
      notifyError();
      Alert.alert("Undo Failed", "Could not undo the wave. It may have already been matched or expired.");
    }
  }, []);

  const handleInvite = useCallback(async () => {
    try {
      await Share.share({
        message:
          "I'm using Wave to connect with people nearby! Download it and wave at me 👋",
      });
    } catch {
      // User cancelled share
    }
  }, []);

  const renderPeer = useCallback(
    ({ item }: { item: NearbyPeer }) => (
      <PeerRow peer={item} onWave={handleWave} onUndo={handleUndo} onPress={setSelectedPeer} isOffline={!isConnected} />
    ),
    [handleWave, handleUndo, isConnected],
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
          <Text className="text-3xl font-bold text-white">Wave</Text>
          <Text className="text-echo-muted text-sm mt-1">
            {totalPeers > 0
              ? `${totalPeers} ${totalPeers === 1 ? "person" : "people"} nearby`
              : isDiscoveryActive
                ? "Searching for people nearby..."
                : "Start scanning to find people"}
          </Text>
        </View>
      </View>

      {/* DEV: Seed/clear fake peers for UI testing */}
      {__DEV__ && (
        <View className="flex-row mb-2" style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={() => { seedFakePeers(); useBleStore.getState().setDiscoveryActive(true); }}
            className="bg-yellow-600/30 rounded-lg px-3 py-1.5"
          >
            <Text className="text-yellow-400 text-xs font-semibold">Seed Peers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={clearFakePeers}
            className="bg-red-600/30 rounded-lg px-3 py-1.5"
          >
            <Text className="text-red-400 text-xs font-semibold">Clear Peers</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status bar */}
      <BleStatusBar
        adapterState={adapterState}
        isScanning={isScanning}
        isAdvertising={isAdvertising}
        error={error}
      />

      {/* Offline banner */}
      {!isConnected && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(200)}
          className="bg-yellow-500/20 border border-yellow-500/40 rounded-2xl py-3 px-4 mb-4 flex-row items-center"
        >
          <Text className="text-lg mr-3">📡</Text>
          <View className="flex-1">
            <Text className="text-yellow-400 font-semibold text-sm">
              No internet connection
            </Text>
            <Text className="text-echo-muted text-xs mt-0.5">
              You can see nearby people, but waves need internet to send.
            </Text>
          </View>
        </Animated.View>
      )}

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6c63ff"
            enabled={isDiscoveryActive}
          />
        }
        ListFooterComponent={
          !showAllPeers && totalPeers > PEER_DISPLAY_CAP ? (
            <TouchableOpacity
              onPress={() => setShowAllPeers(true)}
              className="bg-echo-surface rounded-2xl py-3 items-center mt-2 mb-4"
            >
              <Text className="text-echo-accent text-sm font-semibold">
                Show {totalPeers - PEER_DISPLAY_CAP} more {totalPeers - PEER_DISPLAY_CAP === 1 ? "person" : "people"}
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          isDiscoveryActive ? (
            <View className="items-center mt-16">
              {/* Pulse animation */}
              <ScanPulse />

              <Text className="text-white text-base font-semibold mb-2 mt-6">
                Looking for people...
              </Text>
              {showProximityHint ? (
                <Text className="text-echo-muted text-sm text-center px-8 mb-8">
                  Wave users were detected in your area. Keep scanning — they
                  may appear as you move around.
                </Text>
              ) : (
                <Text className="text-echo-muted text-sm text-center px-8 mb-8">
                  Wave at someone nearby. If they wave back, you'll match and
                  see each other's Instagram!
                </Text>
              )}

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

      {/* Peer detail modal */}
      {selectedPeer && (
        <PeerDetailModal peer={selectedPeer} onClose={() => setSelectedPeer(null)} />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
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
  onPress,
  isOffline,
}: {
  peer: NearbyPeer;
  onWave: (p: NearbyPeer) => void;
  onUndo: (token: string) => void;
  onPress: (p: NearbyPeer) => void;
  isOffline: boolean;
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
  const avatar = useMemo(
    () => getAvatarForToken(peer.ephemeralToken),
    [peer.ephemeralToken],
  );
  const freshness = getTimeSince(peer.lastSeen);

  // Auto-expire wave after 15 minutes — revert button to Wave 👋
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
  }, [wavePending, peer.ephemeralToken]);

  return (
    <View
      className={`py-3 px-4 mb-2 rounded-xl flex-row items-center ${
        isAlreadyMatched
          ? "bg-pink-500/10 border border-pink-500/20"
          : hasWavedAtMe
            ? "bg-green-500/10 border border-green-500/20"
            : "bg-echo-surface"
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
          <Text className="text-echo-muted text-xs">{freshness}</Text>
        </View>
      </Pressable>

      {/* Wave / Undo / Matched */}
      {isAlreadyMatched ? (
        <TouchableOpacity
          onPress={() => onPress(peer)}
          className="bg-echo-match/20 border border-echo-match/40 rounded-lg px-3 py-1.5"
        >
          <Text className="text-echo-match font-semibold text-sm">
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
              ? "bg-echo-muted/10 border border-echo-muted/20"
              : hasWavedAtMe
                ? "bg-green-500/20 border border-green-500/40"
                : "bg-echo-wave/20 border border-echo-wave/40"
          }`}
        >
          <Text
            className={`font-semibold text-sm ${
              isOffline
                ? "text-echo-muted"
                : hasWavedAtMe ? "text-green-400" : "text-echo-wave"
            }`}
          >
            {hasWavedAtMe ? "Wave Back 👋" : "Wave 👋"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─── Peer Detail Modal ────────────────────────────────────── */

function PeerDetailModal({
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
  const isMatched = useEchoStore((s) => s.matchedTokens.has(peer.ephemeralToken));
  const instagramHandle = useEchoStore((s) => s.matchedHandles.get(peer.ephemeralToken));

  const openInstagram = () => {
    if (!instagramHandle) return;
    Linking.openURL(`instagram://user?username=${instagramHandle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${instagramHandle}`).catch(() => {});
    });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-black/60 justify-end">
        <Pressable onPress={(e) => e.stopPropagation()} className="bg-echo-surface rounded-t-3xl px-6 pt-6 pb-10">
          {/* Handle bar */}
          <View className="w-10 h-1 rounded-full bg-echo-muted/40 self-center mb-5" />

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
              <View className="bg-echo-match/20 rounded-full px-3 py-1 mt-2">
                <Text className="text-echo-match text-xs font-semibold">Matched</Text>
              </View>
            )}
          </View>

          {/* Instagram handle (if matched) */}
          {isMatched && instagramHandle && (
            <TouchableOpacity
              onPress={openInstagram}
              className="bg-echo-bg rounded-xl px-4 py-3 mb-4 flex-row items-center justify-between"
            >
              <Text className="text-echo-muted text-sm">Instagram</Text>
              <Text className="text-echo-accent text-sm font-semibold">@{instagramHandle}</Text>
            </TouchableOpacity>
          )}

          {/* Details */}
          <View className="bg-echo-bg rounded-xl px-4 py-3 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-echo-muted text-sm">Distance</Text>
              <Text className={`text-sm font-medium ${zoneColor}`}>{zoneLabel}</Text>
            </View>
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-echo-muted text-sm">Signal</Text>
              <Text className="text-white text-sm">{signal}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-echo-muted text-sm">Last seen</Text>
              <Text className="text-white text-sm">{freshness}</Text>
            </View>
          </View>

          {/* View Matches (if matched) */}
          {isMatched && (
            <TouchableOpacity
              onPress={() => { onClose(); router.push("/(main)/history"); }}
              className="bg-echo-primary rounded-xl py-3 items-center mb-3"
            >
              <Text className="text-white text-sm font-semibold">View All Matches</Text>
            </TouchableOpacity>
          )}

          {/* Close */}
          <TouchableOpacity onPress={onClose} className="bg-echo-bg rounded-xl py-3 items-center">
            <Text className="text-white text-sm font-semibold">Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}