import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";

interface PermissionGateProps {
  onRequestPermissions: () => void;
  isLoading: boolean;
}

export function PermissionGate({
  onRequestPermissions,
  isLoading,
}: PermissionGateProps) {
  return (
    <View className="flex-1 bg-echo-bg items-center justify-center px-8">
      {/* Icon */}
      <View className="w-24 h-24 rounded-full bg-echo-primary/20 items-center justify-center mb-8">
        <Text className="text-5xl text-echo-primary">{")))"}</Text>
      </View>

      <Text className="text-3xl font-bold text-white text-center mb-3">
        Discover Nearby
      </Text>
      <Text className="text-echo-muted text-center text-base mb-8 leading-6">
        Echo uses Bluetooth to find people around you. Your identity stays
        anonymous until you both wave at each other.
      </Text>

      <View className="bg-echo-surface rounded-2xl p-4 mb-8 w-full">
        <BulletPoint text="Bluetooth scans for nearby Echo users" />
        <BulletPoint text="No GPS tracking - only proximity" />
        <BulletPoint text="Your identity is hidden until mutual match" />
      </View>

      <TouchableOpacity
        onPress={onRequestPermissions}
        disabled={isLoading}
        className="bg-echo-primary py-4 px-12 rounded-2xl w-full items-center"
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-lg font-semibold">
            Enable Bluetooth
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <View className="flex-row items-start mb-2">
      <Text className="text-echo-accent mr-2 mt-0.5">✓</Text>
      <Text className="text-echo-text text-sm flex-1">{text}</Text>
    </View>
  );
}
