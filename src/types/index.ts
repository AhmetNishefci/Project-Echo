export interface NearbyPeer {
  deviceBleId: string;
  ephemeralToken: string;
  rssi: number;
  lastSeen: number;
  discoveredAt: number;
}

export type DistanceZone = "HERE" | "CLOSE" | "NEARBY";

/**
 * RSSI thresholds for distance zones:
 * HERE:   >= -55 dBm  (~1-3 meters)
 * CLOSE:  >= -75 dBm  (~3-10 meters)
 * NEARBY: < -75 dBm   (~10-30 meters)
 */
export function getDistanceZone(rssi: number): DistanceZone {
  if (rssi >= -55) return "HERE";
  if (rssi >= -75) return "CLOSE";
  return "NEARBY";
}

export interface WavePending {
  targetToken: string;
  sentAt: number;
}

export interface Match {
  matchId: string;
  matchedUserId: string;
  createdAt: string;
  seen: boolean;
}

export type BlePermissionStatus = "unknown" | "granted" | "denied" | "blocked";

export type WaveResult = "pending" | "match" | "error";

export type BleAdapterState =
  | "Unknown"
  | "Resetting"
  | "Unsupported"
  | "Unauthorized"
  | "PoweredOff"
  | "PoweredOn";
