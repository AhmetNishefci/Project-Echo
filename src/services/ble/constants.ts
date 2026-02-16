// Echo BLE Protocol Constants

// Custom 128-bit Service UUID for the Echo network.
// All Echo devices advertise and scan for this UUID.
export const ECHO_SERVICE_UUID = "E5C00001-B5A3-F393-E0A9-E50E24DCCA9E";

// GATT Characteristic UUID for the ephemeral token.
// Used when the local name is stripped in background mode.
export const ECHO_TOKEN_CHAR_UUID = "E5C00002-B5A3-F393-E0A9-E50E24DCCA9E";

// Prefix used in the BLE local name to carry the ephemeral token.
// Format: "E:{16-char-hex-token}"
export const LOCAL_NAME_PREFIX = "E:";

// Scanning timing
export const SCAN_DURATION_MS = 10_000; // Scan for 10 seconds
export const SCAN_PAUSE_MS = 2_000; // Pause 2 seconds between scan cycles
export const PEER_STALE_TIMEOUT_MS = 30_000; // Remove peer after 30s not seen

// GATT connection settings for background token reads
export const GATT_CONNECT_TIMEOUT_MS = 5_000;
export const GATT_READ_COOLDOWN_MS = 30_000;

// Ephemeral ID timing
export const EPHEMERAL_ROTATION_MS = 15 * 60 * 1000; // 15 minutes
export const EPHEMERAL_REFRESH_BUFFER_MS = 3 * 60 * 1000; // Refresh 3 minutes early

// Wave timing
export const WAVE_EXPIRY_MINUTES = 15;
