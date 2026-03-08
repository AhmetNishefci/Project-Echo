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
import type { NearbyPeer, Gender } from "@/types";
import { genderCharToGender } from "@/types";
import { logger } from "@/utils/logger";

// Cap concurrent GATT connections to avoid exhausting iOS limit (M8 fix)
const MAX_CONCURRENT_GATT = 4;
const UPSERT_BATCH_MS = 300;

/**
 * Scanner session state — isolated per BLE session to prevent leaks
 * across login/logout cycles. Each call to startScanning() binds the
 * session; resetScannerState() clears it on destroy.
 */
interface ScannerSession {
  pendingGattReads: Set<string>;
  recentGattReads: Map<string, number>;
  pendingUpserts: NearbyPeer[];
  upsertTimer: ReturnType<typeof setTimeout> | null;
  bleManager: BleManager | null;
}

let session: ScannerSession = createFreshSession();

function createFreshSession(): ScannerSession {
  return {
    pendingGattReads: new Set(),
    recentGattReads: new Map(),
    pendingUpserts: [],
    upsertTimer: null,
    bleManager: null,
  };
}

interface BlePayload {
  token: string;
  gender: Gender | null;
}

/**
 * Extract the ephemeral token and gender from a device's local name.
 * Format: "E:{gender_char}{16-char-hex-token}" (e.g. "E:Mabc123def456a7b8")
 * Falls back to legacy format "E:{16-char-hex-token}" for compatibility.
 */
function extractPayload(device: Device): BlePayload | null {
  const name = device.localName ?? device.name;
  if (!name || !name.startsWith(LOCAL_NAME_PREFIX)) return null;
  const raw = name.slice(LOCAL_NAME_PREFIX.length);

  // New format: gender char + 16 hex chars (17 total)
  if (raw.length === 17) {
    const gender = genderCharToGender(raw[0]);
    const token = raw.slice(1).toLowerCase(); // Case-insensitive (M11 fix)
    if (/^[0-9a-f]{16}$/.test(token)) {
      return { token, gender };
    }
  }

  // Legacy format: 16 hex chars (no gender)
  const rawLower = raw.toLowerCase(); // Case-insensitive (M11 fix)
  if (rawLower.length === 16 && /^[0-9a-f]{16}$/.test(rawLower)) {
    return { token: rawLower, gender: null };
  }

  return null;
}

/**
 * Parse a raw GATT characteristic value into token + gender.
 * Handles both new format (gender char + 16 hex) and legacy (16 hex).
 */
function parseGattValue(decoded: string): BlePayload | null {
  // New format: gender char + 16 hex chars
  if (decoded.length === 17) {
    const gender = genderCharToGender(decoded[0]);
    const token = decoded.slice(1).toLowerCase(); // Case-insensitive (M11 fix)
    if (/^[0-9a-f]{16}$/.test(token)) {
      return { token, gender };
    }
  }

  // Legacy format: 16 hex chars
  const lower = decoded.toLowerCase(); // Case-insensitive (M11 fix)
  if (lower.length === 16 && /^[0-9a-f]{16}$/.test(lower)) {
    return { token: lower, gender: null };
  }

  return null;
}

/**
 * Start scanning for nearby Echo devices.
 * In foreground: tokens are read from the advertisement local name.
 * In background: tokens are read via GATT connection (iOS strips local name).
 */
export function startScanning(bleManager: BleManager): void {
  const store = useBleStore.getState();
  session.bleManager = bleManager;

  if (store.isScanning) {
    logger.ble("Already scanning, skipping");
    return;
  }

  // Clear error on successful scan start (H9 fix)
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

  // Flush pending upserts before clearing, so recently-discovered peers
  // are not silently dropped (H10 fix)
  if (session.upsertTimer) {
    clearTimeout(session.upsertTimer);
    session.upsertTimer = null;
  }
  if (session.pendingUpserts.length > 0) {
    const batch = session.pendingUpserts;
    session.pendingUpserts = [];
    useBleStore.setState((state) => {
      const next = new Map(state.nearbyPeers);
      for (const p of batch) {
        next.set(p.ephemeralToken, p);
      }
      return { nearbyPeers: next };
    });
  }

  useBleStore.setState({ isScanning: false });
  logger.ble("Stopped BLE scan");
}

/** Prune stale entries from the GATT read cooldown map */
export function pruneGattReadCache(): void {
  const now = Date.now();
  for (const [id, ts] of session.recentGattReads) {
    if (now - ts > GATT_READ_COOLDOWN_MS * 3) {
      session.recentGattReads.delete(id);
    }
  }
}

/**
 * Reset module-level state. Called when the BLE manager is destroyed
 * to prevent stale references across sessions (H8 fix).
 */
export function resetScannerState(): void {
  if (session.upsertTimer) {
    clearTimeout(session.upsertTimer);
  }
  session = createFreshSession();
}

function handleDiscoveredDevice(device: Device): void {
  const payload = extractPayload(device);

  if (payload) {
    // Fast path: got token from local name (foreground advertising)
    upsertPeerWithToken(device, payload.token, payload.gender);
    return;
  }

  // Slow path: no local name — device is likely backgrounded on iOS.
  // Connect via GATT to read the token characteristic.
  if (Platform.OS === "ios" && session.bleManager) {
    attemptGattTokenRead(device);
  }
}

function upsertPeerWithToken(device: Device, token: string, gender: Gender | null): void {
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
    gender: gender ?? existing?.gender ?? null,
    note: existing?.note ?? null,
  };

  // Batch upserts to avoid creating a new Map on every BLE advertisement
  session.pendingUpserts.push(peer);
  if (!session.upsertTimer) {
    session.upsertTimer = setTimeout(() => {
      const batch = session.pendingUpserts;
      session.pendingUpserts = [];
      session.upsertTimer = null;

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
    logger.ble(`Discovered peer: ${token.substring(0, 8)}...`, { rssi, gender });
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
  if (session.pendingGattReads.has(deviceId)) return;
  const lastRead = session.recentGattReads.get(deviceId);
  if (lastRead && Date.now() - lastRead < GATT_READ_COOLDOWN_MS) return;

  // Cap concurrent GATT connections (M8 fix)
  if (session.pendingGattReads.size >= MAX_CONCURRENT_GATT) return;

  session.pendingGattReads.add(deviceId);

  // Capture manager reference at call time to detect staleness (H7 fix)
  const manager = session.bleManager;
  if (!manager) {
    session.pendingGattReads.delete(deviceId);
    return;
  }

  try {
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
        try {
          const decoded = atob(read.value);
          const payload = parseGattValue(decoded);
          if (payload) {
            logger.ble(
              `GATT read token: ${payload.token.substring(0, 8)}... from ${deviceId.substring(0, 8)}`,
            );
            upsertPeerWithToken(device, payload.token, payload.gender);
          } else {
            logger.ble(`GATT read invalid token format from ${deviceId.substring(0, 8)}: len=${decoded.length}`);
          }
        } catch (decodeErr) {
          // atob can fail on non-Latin-1 binary data (M14 fix)
          logger.ble(`GATT decode failed for ${deviceId.substring(0, 8)}: ${decodeErr}`);
        }
      }
    }

    session.recentGattReads.set(deviceId, Date.now());
  } catch (error) {
    logger.ble(`GATT read failed for ${deviceId.substring(0, 8)}: ${error}`);
    session.recentGattReads.set(deviceId, Date.now());
  } finally {
    session.pendingGattReads.delete(deviceId);
    // Always disconnect to prevent connection leaks (C6 fix)
    try {
      if (manager) {
        await manager.cancelDeviceConnection(deviceId);
      }
    } catch {
      // Ignore disconnect errors — device may already be disconnected
    }
  }
}
