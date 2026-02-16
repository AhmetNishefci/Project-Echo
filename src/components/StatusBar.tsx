import { View, Text } from "react-native";
import type { BleAdapterState } from "@/types";

interface BleStatusBarProps {
  adapterState: BleAdapterState;
  isScanning: boolean;
  isAdvertising: boolean;
  error: string | null;
}

export function BleStatusBar({
  adapterState,
  isScanning,
  isAdvertising,
  error,
}: BleStatusBarProps) {
  if (error) {
    return (
      <View className="bg-echo-danger/20 rounded-xl px-4 py-2 mb-4">
        <Text className="text-echo-danger text-sm">{error}</Text>
      </View>
    );
  }

  if (adapterState === "PoweredOff") {
    return (
      <View className="bg-yellow-900/30 rounded-xl px-4 py-2 mb-4">
        <Text className="text-yellow-400 text-sm">
          Bluetooth is turned off. Please enable it in Settings.
        </Text>
      </View>
    );
  }

  if (adapterState === "Unauthorized") {
    return (
      <View className="bg-echo-danger/20 rounded-xl px-4 py-2 mb-4">
        <Text className="text-echo-danger text-sm">
          Bluetooth permission denied. Open Settings to allow access.
        </Text>
      </View>
    );
  }

  if (!isScanning && !isAdvertising) {
    return null;
  }

  return (
    <View className="flex-row items-center bg-echo-surface rounded-xl px-4 py-2 mb-4">
      <View className="flex-row items-center flex-1">
        {isScanning && (
          <View className="flex-row items-center mr-4">
            <View className="w-2 h-2 rounded-full bg-echo-accent mr-2" />
            <Text className="text-echo-accent text-xs">Scanning</Text>
          </View>
        )}
        {isAdvertising && (
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full bg-echo-primary mr-2" />
            <Text className="text-echo-primary text-xs">Broadcasting</Text>
          </View>
        )}
      </View>
    </View>
  );
}
