import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";

// BLE peripheral advertising is only implemented for iOS.
// On Android, provide no-op stubs to prevent crashes.
const ExoBlePeripheralModule =
  Platform.OS === "ios"
    ? requireNativeModule("ExoBlePeripheral")
    : {
        startAdvertising: async (_token: string) => {},
        stopAdvertising: async () => {},
        updateToken: async (_token: string) => {},
        isSupported: async () => false,
      };

export default ExoBlePeripheralModule;
