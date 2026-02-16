import { BleManager as PlxBleManager, State, Subscription } from "react-native-ble-plx";
import { startScanning, stopScanning, pruneGattReadCache } from "./scanner";
import {
  startAdvertising,
  stopAdvertising,
  updateAdvertisedToken,
} from "./advertiser";
import { requestBlePermissions } from "./permissions";
import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import { SCAN_DURATION_MS, SCAN_PAUSE_MS } from "./constants";
import type { BleAdapterState } from "@/types";
import { logger } from "@/utils/logger";

class EchoBleManager {
  private bleManager: PlxBleManager | null = null;
  private stateSubscription: Subscription | null = null;
  private scanCycleTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  /**
   * Initialize the BLE manager and request permissions.
   * Must be called before start().
   */
  async initialize(): Promise<void> {
    if (this.bleManager) return;

    this.bleManager = new PlxBleManager();
    logger.ble("BLE Manager initialized");

    // Listen for adapter state changes
    this.stateSubscription = this.bleManager.onStateChange((state) => {
      const mapped = this.mapState(state);
      useBleStore.getState().setAdapterState(mapped);
      logger.ble("Adapter state changed", { state: mapped });

      if (state === "PoweredOff" && this.isRunning) {
        this.pause();
      } else if (state === "PoweredOn" && this.isRunning) {
        this.resume();
      }
    }, true);
  }

  /**
   * Request BLE permissions from the user.
   */
  async requestPermissions(): Promise<"granted" | "denied"> {
    if (!this.bleManager) {
      await this.initialize();
    }

    const status = await requestBlePermissions(this.bleManager!);
    useBleStore.getState().setPermissionStatus(status);

    return status === "granted" ? "granted" : "denied";
  }

  /**
   * Start the BLE engine: begin advertising and scanning.
   * Requires permissions to be granted and a token to advertise.
   */
  async start(): Promise<void> {
    if (!this.bleManager) {
      throw new Error("BLE Manager not initialized. Call initialize() first.");
    }

    const { permissionStatus } = useBleStore.getState();
    if (permissionStatus !== "granted") {
      throw new Error("BLE permissions not granted.");
    }

    const token = useEchoStore.getState().currentToken;
    if (!token) {
      throw new Error("No ephemeral token available. Fetch one first.");
    }

    this.isRunning = true;
    logger.ble("Starting Echo BLE engine");

    // Start advertising
    try {
      await startAdvertising(token);
      useBleStore.getState().setAdvertising(true);
    } catch (error) {
      logger.error("Failed to start advertising", error);
      useBleStore.getState().setError("Failed to start advertising");
    }

    // Mark discovery active (stays true across scan cycles)
    useBleStore.getState().setDiscoveryActive(true);

    // Start scanning cycle
    this.startScanCycle();

    // Start peer pruning
    this.startPruning();
  }

  /**
   * Stop the BLE engine completely.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    logger.ble("Stopping Echo BLE engine");

    this.stopScanCycle();
    this.stopPruning();

    if (this.bleManager) {
      stopScanning(this.bleManager);
    }

    try {
      await stopAdvertising();
    } catch {
      // Ignore
    }

    useBleStore.getState().setScanning(false);
    useBleStore.getState().setAdvertising(false);
    useBleStore.getState().setDiscoveryActive(false);
  }

  /**
   * Update the advertised token (called during rotation).
   */
  async rotateToken(newToken: string): Promise<void> {
    try {
      await updateAdvertisedToken(newToken);
      logger.ble("Token rotated");
    } catch (error) {
      logger.error("Token rotation failed", error);
    }
  }

  /**
   * Clean up resources.
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.stateSubscription?.remove();
    this.bleManager?.destroy();
    this.bleManager = null;
    logger.ble("BLE Manager destroyed");
  }

  /**
   * Restart the scan cycle at full speed.
   * Called when the app returns to foreground after running in background.
   */
  restartScanCycle(): void {
    if (!this.bleManager || !this.isRunning) return;
    this.stopScanCycle();
    if (this.bleManager) {
      stopScanning(this.bleManager);
    }
    this.startScanCycle();
    logger.ble("Scan cycle restarted");
  }

  // --- Private methods ---

  private startScanCycle(): void {
    if (!this.bleManager || !this.isRunning) return;

    startScanning(this.bleManager);

    this.scanCycleTimer = setTimeout(() => {
      if (!this.bleManager || !this.isRunning) return;

      stopScanning(this.bleManager);

      // Pause, then restart
      this.scanCycleTimer = setTimeout(() => {
        this.startScanCycle();
      }, SCAN_PAUSE_MS);
    }, SCAN_DURATION_MS);
  }

  private stopScanCycle(): void {
    if (this.scanCycleTimer) {
      clearTimeout(this.scanCycleTimer);
      this.scanCycleTimer = null;
    }
  }

  private startPruning(): void {
    this.pruneTimer = setInterval(() => {
      useBleStore.getState().pruneStale();
      pruneGattReadCache();
    }, 5_000); // Prune every 5 seconds
  }

  private stopPruning(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  private pause(): void {
    logger.ble("Pausing BLE engine (adapter off)");
    this.stopScanCycle();
    useBleStore.getState().setScanning(false);
  }

  private async resume(): Promise<void> {
    logger.ble("Resuming BLE engine (adapter on)");
    this.startScanCycle();

    // Restart advertising with current token
    const token = useEchoStore.getState().currentToken;
    if (token) {
      try {
        await startAdvertising(token);
        useBleStore.getState().setAdvertising(true);
      } catch (err) {
        logger.error("Failed to restart advertising after resume", err);
      }
    }
  }

  private mapState(state: State): BleAdapterState {
    switch (state) {
      case State.Unknown:
        return "Unknown";
      case State.Resetting:
        return "Resetting";
      case State.Unsupported:
        return "Unsupported";
      case State.Unauthorized:
        return "Unauthorized";
      case State.PoweredOff:
        return "PoweredOff";
      case State.PoweredOn:
        return "PoweredOn";
      default:
        return "Unknown";
    }
  }
}

// Singleton instance
export const echoBleManager = new EchoBleManager();
