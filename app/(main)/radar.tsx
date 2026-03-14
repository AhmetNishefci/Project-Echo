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
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { impactMedium, impactLight, notifySuccess, notifyError } from "@/utils/haptics";
import { useBleStore } from "@/stores/bleStore";
import { useWaveStore } from "@/stores/waveStore";
import { useAuthStore } from "@/stores/authStore";
import { waveBleManager } from "@/services/ble/bleManager";
import { sendWave, undoWave } from "@/services/wave/waves";
import { PermissionGate } from "@/components/PermissionGate";
import { BleStatusBar } from "@/components/StatusBar";
import { Toast } from "@/components/Toast";
import { PeerRow } from "@/components/PeerRow";
import { PeerDetailModal } from "@/components/PeerDetailModal";
import { ScanPulse } from "@/components/ScanPulse";
import type { NearbyPeer, DistanceZone } from "@/types";
import { getDistanceZone } from "@/types";
import { logger } from "@/utils/logger";
import { playWaveSent } from "@/utils/sound";
import { useNoteResolver } from "@/hooks/useNoteResolver";
import { seedFakePeers, clearFakePeers } from "@/utils/seedPeers";
import { getCurrentLocation, updateLocationOnServer } from "@/services/location";
import { showPermissionBlockedAlert } from "@/services/ble/permissions";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

const ZONE_CONFIG: Record<DistanceZone, { label: string; color: string }> = {
  HERE: { label: "Right Here", color: "text-green-400" },
  CLOSE: { label: "Close By", color: "text-blue-400" },
  NEARBY: { label: "Nearby", color: "text-wave-muted" },
};

const PEER_DISPLAY_CAP = 50;

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
  const { currentToken } = useWaveStore();
  const rawIncomingWaveTokens = useWaveStore((s) => s.incomingWaveTokens);
  const matchedTokens = useWaveStore((s) => s.matchedTokens);
  const genderPreference = useAuthStore((s) => s.genderPreference);
  const agePreferenceMin = useAuthStore((s) => s.agePreferenceMin);
  const agePreferenceMax = useAuthStore((s) => s.agePreferenceMax);
  const { isConnected } = useNetworkStatus();

  // Filter peers by gender and age preferences before display
  const filteredPeers = useMemo(() => {
    const filtered = new Map<string, NearbyPeer>();
    const filterGender = genderPreference && genderPreference !== "both";
    const filterAge = agePreferenceMin != null && agePreferenceMax != null;

    for (const [token, peer] of nearbyPeers) {
      // Gender filter: show if no preference, preference is "both", gender matches, or gender unknown
      if (filterGender && peer.gender && peer.gender !== genderPreference) {
        continue;
      }
      // Age filter: show if no preference set, age matches range, or age unknown
      if (filterAge && peer.age != null) {
        if (peer.age < agePreferenceMin || peer.age > agePreferenceMax) {
          continue;
        }
      }
      filtered.set(token, peer);
    }

    return filtered;
  }, [nearbyPeers, genderPreference, agePreferenceMin, agePreferenceMax]);

  // Only count incoming waves from wavers still visible on the radar
  // AND matching gender preference (prevent phantom wave notifications).
  const incomingWaveTokens = useMemo(
    () => rawIncomingWaveTokens.filter((t) => filteredPeers.has(t)),
    [rawIncomingWaveTokens, filteredPeers],
  );
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" } | null>(null);
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
    waveBleManager.restartScanCycle();
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
      const result = await waveBleManager.requestPermissions();
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

      let token = useWaveStore.getState().currentToken;
      if (!token) {
        for (let i = 0; i < 16; i++) {
          await new Promise((r) => setTimeout(r, 500));
          token = useWaveStore.getState().currentToken;
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

      await waveBleManager.start();
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
    await waveBleManager.stop();
  }, []);

  const handleWave = useCallback(async (peer: NearbyPeer) => {
    const store = useWaveStore.getState();
    if (store.hasPendingWaveTo(peer.ephemeralToken)) return;

    impactMedium();
    playWaveSent();
    store.addPendingWave(peer.ephemeralToken);

    logger.wave("Sending wave to peer", {
      token: peer.ephemeralToken.substring(0, 8),
    });

    const result = await sendWave(peer.ephemeralToken);

    if (result.status === "error") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      setToast({ message: "Could not send wave. Try again.", variant: "error" });
    } else if (result.status === "already_matched") {
      store.removePendingWave(peer.ephemeralToken);
      store.addMatchedToken(peer.ephemeralToken, {
        instagram: result.match?.instagramHandle,
        snapchat: result.match?.snapchatHandle,
      });
      setToast({ message: "You've already matched with this person!" });
    } else if (result.status === "rate_limited") {
      store.removePendingWave(peer.ephemeralToken);
      notifyError();
      setToast({ message: "You're waving too fast. Wait a moment.", variant: "error" });
    } else if (result.status === "match") {
      store.removePendingWave(peer.ephemeralToken);
      store.addMatchedToken(peer.ephemeralToken, {
        instagram: result.match?.instagramHandle,
        snapchat: result.match?.snapchatHandle,
      });
      notifySuccess();
      logger.wave("Match from wave!");
    } else if (result.status === "pending") {
      // Store userId → token mapping so realtime match events can bridge to radar
      if (result.targetUserId) {
        store.setPendingWaveUser(result.targetUserId, peer.ephemeralToken);
      }
      setToast({ message: "Wave sent! You can undo anytime before it expires." });
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
      useWaveStore.getState().removePendingWaveByToken(targetToken);
      setToast({ message: "Wave undone" });
    } else {
      notifyError();
      setToast({ message: "Could not undo wave. It may have been matched or expired.", variant: "error" });
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
        <Text className="text-wave-muted text-sm ml-2">
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
    <View className="flex-1 bg-wave-bg pt-16 px-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-3xl font-bold text-white">Wave</Text>
          <Text className="text-wave-muted text-sm mt-1">
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
            <Text className="text-wave-muted text-xs mt-0.5">
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
          className="bg-wave-wave/20 border border-wave-wave/40 rounded-2xl py-3 px-4 mb-4 flex-row items-center"
        >
          <Text className="text-2xl mr-3">👋</Text>
          <View className="flex-1">
            <Text className="text-white font-semibold text-sm">
              {incomingWaveTokens.length === 1
                ? "Someone nearby waved at you!"
                : `${incomingWaveTokens.length} people nearby waved at you!`}
            </Text>
            <Text className="text-wave-muted text-xs mt-0.5">
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
          className={`py-4 rounded-2xl items-center mb-4 ${isStarting ? "bg-wave-primary/70" : "bg-wave-primary"}`}
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
          className="bg-wave-surface py-4 rounded-2xl items-center mb-4 border border-wave-muted"
        >
          <Text className="text-wave-muted text-lg font-semibold">
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
              className="bg-wave-surface rounded-2xl py-3 items-center mt-2 mb-4"
            >
              <Text className="text-wave-accent text-sm font-semibold">
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
                <Text className="text-wave-muted text-sm text-center px-8 mb-8">
                  Wave users were detected in your area. Keep scanning — they
                  may appear as you move around.
                </Text>
              ) : (
                <Text className="text-wave-muted text-sm text-center px-8 mb-8">
                  Wave at someone nearby. If they wave back, you'll match and
                  see each other's Instagram!
                </Text>
              )}

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={handleInvite}
                className="bg-wave-surface border border-wave-muted rounded-2xl py-3 px-6 flex-row items-center"
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
                <View className="w-16 h-16 rounded-full bg-wave-primary/20 items-center justify-center border-2 border-wave-primary/40">
                  <Text className="text-3xl">📡</Text>
                </View>
              </View>

              <Text className="text-white text-lg font-bold mb-2 mt-6">
                Discover People Nearby
              </Text>
              <Text className="text-wave-muted text-sm text-center px-8 leading-5">
                Tap <Text className="text-wave-primary font-semibold">Start Discovery</Text> to
                find people around you. Wave at someone — if they wave back,
                you'll match and see each other's Instagram.
              </Text>

              {/* Invite CTA */}
              <TouchableOpacity
                onPress={handleInvite}
                className="bg-wave-surface border border-wave-muted rounded-2xl py-3 px-6 flex-row items-center mt-8"
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

      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={() => setToast(null)} />
    </View>
  );
}

