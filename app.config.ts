import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Echo",
  slug: "project-echo",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  scheme: "echo",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0a0a0a",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.ahmetnishefci.echo",
    infoPlist: {
      NSBluetoothAlwaysUsageDescription:
        "Echo uses Bluetooth to discover nearby people and let you wave at them.",
      NSBluetoothPeripheralUsageDescription:
        "Echo broadcasts your presence so nearby people can discover you.",
      UIBackgroundModes: ["bluetooth-central", "bluetooth-peripheral"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0a0a0a",
    },
    package: "com.ahmetnishefci.echo",
    permissions: [
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_SCAN",
      "BLUETOOTH_ADVERTISE",
      "BLUETOOTH_CONNECT",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
    ],
  },
  plugins: [
    "expo-router",
    [
      "react-native-ble-plx",
      {
        isBackgroundEnabled: true,
        modes: ["central", "peripheral"],
        bluetoothAlwaysPermission:
          "Echo uses Bluetooth to discover nearby people.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        sounds: [],
      },
    ],
  ],
});
