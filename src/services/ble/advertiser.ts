import * as BlePeripheral from "../../../modules/expo-ble-peripheral";
import { logger } from "@/utils/logger";

/**
 * Start advertising as a BLE peripheral with the given ephemeral token.
 * The token is served via a GATT characteristic that scanners read after connecting.
 */
export async function startAdvertising(token: string): Promise<void> {
  try {
    logger.ble("Starting BLE advertising", { token: token.substring(0, 8) });
    await BlePeripheral.startAdvertising(token);
    logger.ble("Advertising started");
  } catch (error) {
    logger.error("Failed to start advertising", error);
    throw error;
  }
}

/**
 * Stop BLE advertising.
 */
export async function stopAdvertising(): Promise<void> {
  try {
    await BlePeripheral.stopAdvertising();
    logger.ble("Advertising stopped");
  } catch (error) {
    logger.error("Failed to stop advertising", error);
    throw error;
  }
}

/**
 * Update the ephemeral token being served via the GATT characteristic.
 * Called during token rotation.
 */
export async function updateAdvertisedToken(newToken: string): Promise<void> {
  try {
    await BlePeripheral.updateToken(newToken);
    logger.ble("Updated advertised token", {
      token: newToken.substring(0, 8),
    });
  } catch (error) {
    logger.error("Failed to update token", error);
    throw error;
  }
}

/**
 * Check if BLE peripheral (advertising) mode is supported on this device.
 */
export async function isPeripheralSupported(): Promise<boolean> {
  try {
    return await BlePeripheral.isSupported();
  } catch {
    return false;
  }
}
