import { BleManager, Device } from "react-native-ble-plx";
import { Platform } from "react-native";
import {
  ECHO_SERVICE_UUID,
  ECHO_TOKEN_CHAR_UUID,
  LOCAL_NAME_PREFIX,
  GATT_CONNECT_TIMEOUT_MS,
  GATT_READ_COOLDOWN_MS,
} from "./constants";
import { useBleStore } from "@/stores/bleStore";
import type { NearbyPeer } from "@/types";
import { logger } from "@/utils/logger";

// Track pending and recently-completed GATT connections to avoid duplicates
const pendingGattReads = new Set<string>();
const recentGattReads = new Map<string, number>();

// Batch upsert buffer — avoids creating a new Map on every BLE advertisement
let pendingUpserts: NearbyPeer[] = [];
let upsertTimer: ReturnType<typeof setTimeout> | null = null;
const UPSERT_BATCH_MS = 300;

/** Reference to the BleManager, set when scanning starts */
let scannerBleManager: BleManager | null = null;

/**
 * Extract the ephemeral token from a device's local name.
 * The format is "E:{token}" where token is a 16-char hex string.
 * Returns null if the name doesn't match the expected format.
 */
function extractToken(device: Device): string | null {
  const name = device.localName ?? device.name;
  if (!name || !name.startsWith(LOCAL_NAME_PREFIX)) return null;
  const token = name.slice(LOCAL_NAME_PREFIX.length);
  if (token.length !== 16 || !/^[0-9a-f]{16}$/.test(token)) return null;
  return token;
}

/**
 * Start scanning for nearby Echo devices.
 * In foreground: tokens are read from the advertisement local name.
 * In background: tokens are read via GATT connection (iOS strips local name).
 */
export function startScanning(bleManager: BleManager): void {
  const store = useBleStore.getState();
  scannerBleManager = bleManager;

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
  // Clear any pending batch upsert
  if (upsertTimer) {
    clearTimeout(upsertTimer);
    upsertTimer = null;
  }
  pendingUpserts = [];
  useBleStore.setState({ isScanning: false });
  logger.ble("Stopped BLE scan");
}

/** Prune stale entries from the GATT read cooldown map */
export function pruneGattReadCache(): void {
  const now = Date.now();
  for (const [id, ts] of recentGattReads) {
    if (now - ts > GATT_READ_COOLDOWN_MS * 3) {
      recentGattReads.delete(id);
    }
  }
}

function handleDiscoveredDevice(device: Device): void {
  const token = extractToken(device);

  if (token) {
    // Fast path: got token from local name (foreground advertising)
    upsertPeerWithToken(device, token);
    return;
  }

  // Slow path: no local name — device is likely backgrounded on iOS.
  // Connect via GATT to read the token characteristic.
  if (Platform.OS === "ios" && scannerBleManager) {
    attemptGattTokenRead(device);
  }
}

function upsertPeerWithToken(device: Device, token: string): void {
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

  // Batch upserts to avoid creating a new Map on every BLE advertisement
  pendingUpserts.push(peer);
  if (!upsertTimer) {
    upsertTimer = setTimeout(() => {
      const batch = pendingUpserts;
      pendingUpserts = [];
      upsertTimer = null;

      useBleStore.setState((state) => {
        const next = new Map(state.nearbyPeers);
        for (const p of batch) {
          next.set(p.ephemeralToken, p);
        }
        return { nearbyPeers: next };
      });
    }, UPSERT_BATCH_MS);
  }

  if (!existing) {
    logger.ble(`Discovered peer: ${token.substring(0, 8)}...`, { rssi });
  }
}

/**
 * Connect to a discovered device via GATT to read its ephemeral token.
 * Used when the device is advertising in background mode and iOS has
 * stripped the local name from the advertising packet.
 */
async function attemptGattTokenRead(device: Device): Promise<void> {
  const deviceId = device.id;

  // Skip if already in-progress or recently attempted
  if (pendingGattReads.has(deviceId)) return;
  const lastRead = recentGattReads.get(deviceId);
  if (lastRead && Date.now() - lastRead < GATT_READ_COOLDOWN_MS) return;

  pendingGattReads.add(deviceId);

  try {
    const manager = scannerBleManager!;

    const connected = await manager.connectToDevice(deviceId, {
      timeout: GATT_CONNECT_TIMEOUT_MS,
    });

    await connected.discoverAllServicesAndCharacteristics();

    const chars = await connected.characteristicsForService(ECHO_SERVICE_UUID);
    const tokenChar = chars?.find(
      (c) => c.uuid.toUpperCase() === ECHO_TOKEN_CHAR_UUID.toUpperCase(),
    );

    if (tokenChar) {
      const read = await tokenChar.read();
      if (read.value) {
        // react-native-ble-plx returns base64-encoded data
        // Use atob (available on Hermes 0.71+); no Buffer in React Native
        const decoded = atob(read.value);
        // Validate: must be exactly 16 lowercase hex characters
        if (/^[0-9a-f]{16}$/.test(decoded)) {
          logger.ble(
            `GATT read token: ${decoded.substring(0, 8)}... from ${deviceId.substring(0, 8)}`,
          );
          upsertPeerWithToken(device, decoded);
        } else {
          logger.ble(`GATT read invalid token format from ${deviceId.substring(0, 8)}: len=${decoded.length}`);
        }
      }
    }

    await manager.cancelDeviceConnection(deviceId).catch(() => {});
    recentGattReads.set(deviceId, Date.now());
  } catch (error) {
    logger.ble(`GATT read failed for ${deviceId.substring(0, 8)}: ${error}`);
    recentGattReads.set(deviceId, Date.now());
  } finally {
    pendingGattReads.delete(deviceId);
  }
}
