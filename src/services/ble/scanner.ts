import { BleManager, Device } from "react-native-ble-plx";
import { ECHO_SERVICE_UUID, LOCAL_NAME_PREFIX } from "./constants";
import { useBleStore } from "@/stores/bleStore";
import type { NearbyPeer } from "@/types";
import { logger } from "@/utils/logger";

/**
 * Extract the ephemeral token from a device's local name.
 * The format is "E:{token}" where token is a 16-char hex string.
 * Returns null if the name doesn't match the expected format.
 */
function extractToken(device: Device): string | null {
  const name = device.localName ?? device.name;
  if (!name || !name.startsWith(LOCAL_NAME_PREFIX)) return null;
  const token = name.slice(LOCAL_NAME_PREFIX.length);
  if (token.length === 0) return null;
  return token;
}

/**
 * Start scanning for nearby Echo devices.
 * Tokens are read directly from the advertisement local name — no GATT connection needed.
 */
export function startScanning(bleManager: BleManager): void {
  const store = useBleStore.getState();

  if (store.isScanning) {
    logger.ble("Already scanning, skipping");
    return;
  }

  useBleStore.setState({ isScanning: true, error: null });
  logger.ble("Starting BLE scan for Echo devices");

  bleManager.startDeviceScan(
    [ECHO_SERVICE_UUID],
    { allowDuplicates: true },
    (error, device) => {
      if (error) {
        logger.error("Scan error", error);
        useBleStore.setState({ error: error.message, isScanning: false });
        return;
      }

      if (!device) return;

      handleDiscoveredDevice(device);
    },
  );
}

export function stopScanning(bleManager: BleManager): void {
  bleManager.stopDeviceScan();
  useBleStore.setState({ isScanning: false });
  logger.ble("Stopped BLE scan");
}

function handleDiscoveredDevice(device: Device): void {
  const token = extractToken(device);
  if (!token) return;

  const deviceId = device.id;
  const rssi = device.rssi ?? -100;
  const now = Date.now();

  const existing = useBleStore.getState().nearbyPeers.get(token);

  const peer: NearbyPeer = {
    deviceBleId: deviceId,
    ephemeralToken: token,
    rssi,
    lastSeen: now,
    discoveredAt: existing?.discoveredAt ?? now,
  };

  useBleStore.getState().upsertPeer(peer);

  if (!existing) {
    logger.ble(`Discovered peer: ${token.substring(0, 8)}...`, { rssi });
  }
}
