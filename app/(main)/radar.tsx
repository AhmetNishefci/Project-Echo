import { useCallback, useMemo, useState } from "react";
import { View, Text, SectionList, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { echoBleManager } from "@/services/ble/bleManager";
import { sendWave } from "@/services/echo/waves";
import { PermissionGate } from "@/components/PermissionGate";
import { BleStatusBar } from "@/components/StatusBar";
import type { NearbyPeer, DistanceZone } from "@/types";
import { getDistanceZone } from "@/types";
import { logger } from "@/utils/logger";

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
    isAdvertising,
    permissionStatus,
    nearbyPeers,
    error,
  } = useBleStore();
  const { currentToken } = useEchoStore();
  const [isStarting, setIsStarting] = useState(false);

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

    // Only include zones that have peers
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

  const handleStartDiscovery = useCallback(async () => {
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

      if (!currentToken) {
        Alert.alert(
          "Not Ready",
          "Waiting for server token. Please try again in a moment.",
        );
        return;
      }

      await echoBleManager.start();
    } catch (err) {
      logger.error("Failed to start discovery", err);
      Alert.alert("Error", "Failed to start Bluetooth discovery.");
    } finally {
      setIsStarting(false);
    }
  }, [currentToken]);

  const handleStopDiscovery = useCallback(async () => {
    await echoBleManager.stop();
  }, []);

  const handleWave = useCallback(async (peer: NearbyPeer) => {
    const store = useEchoStore.getState();
    if (store.hasPendingWaveTo(peer.ephemeralToken)) return;

    // Optimistically mark as waved
    store.addPendingWave(peer.ephemeralToken);

    logger.echo("Sending wave to peer", {
      token: peer.ephemeralToken.substring(0, 8),
    });

    const result = await sendWave(peer.ephemeralToken);

    if (result === "error") {
      // Remove optimistic wave on error
      store.removePendingWave(peer.ephemeralToken);
      Alert.alert("Wave Failed", "Could not send wave. Try again.");
    } else if (result === "match") {
      // Match screen navigation is handled by the layout's latestUnseenMatch listener
      logger.echo("Match from wave!");
    }
  }, []);

  const renderPeer = useCallback(
    ({ item }: { item: NearbyPeer }) => {
      const hasPendingWave = useEchoStore
        .getState()
        .hasPendingWaveTo(item.ephemeralToken);
      return (
        <TouchableOpacity
          onPress={() => handleWave(item)}
          disabled={hasPendingWave}
          className={`py-3 px-4 mb-2 rounded-xl flex-row items-center justify-between ${
            hasPendingWave ? "bg-echo-surface/50" : "bg-echo-surface"
          }`}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center flex-1">
            <View className="w-3 h-3 rounded-full bg-echo-wave mr-3" />
            <Text className="text-white text-base">
              Someone{" "}
              <Text className="text-echo-muted text-xs">
                {item.rssi} dBm
              </Text>
            </Text>
          </View>
          <Text
            className={`font-semibold text-sm ${
              hasPendingWave ? "text-echo-muted" : "text-echo-wave"
            }`}
          >
            {hasPendingWave ? "Waved" : "Wave"}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleWave],
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
  if (permissionStatus !== "granted" && !isScanning) {
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
            {totalPeers === 0
              ? "Searching for people nearby..."
              : `${totalPeers} ${totalPeers === 1 ? "person" : "people"} nearby`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/(main)/settings")}
          className="p-2"
        >
          <Text className="text-echo-muted text-2xl">???</Text>
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      <BleStatusBar
        adapterState={adapterState}
        isScanning={isScanning}
        isAdvertising={isAdvertising}
        error={error}
      />

      {/* Start/Stop button */}
      {!isScanning && !isAdvertising ? (
        <TouchableOpacity
          onPress={handleStartDiscovery}
          disabled={isStarting}
          className="bg-echo-primary py-4 rounded-2xl items-center mb-4"
        >
          <Text className="text-white text-lg font-semibold">
            {isStarting ? "Starting..." : "Start Discovery"}
          </Text>
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
          isScanning ? (
            <View className="items-center mt-20">
              <Text className="text-echo-muted text-base">
                Scanning for Echo users...
              </Text>
              <Text className="text-echo-muted text-sm mt-2">
                Make sure another device is running Echo nearby
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
