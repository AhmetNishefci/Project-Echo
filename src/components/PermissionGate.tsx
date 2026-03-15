import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";

interface PermissionGateProps {
  onRequestPermissions: () => void;
  isLoading: boolean;
}

export function PermissionGate({
  onRequestPermissions,
  isLoading,
}: PermissionGateProps) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-wave-bg items-center justify-center px-8">
      {/* Icon */}
      <View className="w-24 h-24 rounded-full bg-wave-primary/20 items-center justify-center mb-8">
        <Text className="text-5xl text-wave-primary">{")))"}</Text>
      </View>

      <Text className="text-3xl font-bold text-white text-center mb-3">
        {t("permissions.title")}
      </Text>
      <Text className="text-wave-muted text-center text-base mb-8 leading-6">
        {t("permissions.description")}
      </Text>

      <View className="bg-wave-surface rounded-2xl p-4 mb-8 w-full">
        <BulletPoint text={t("permissions.bullet1")} />
        <BulletPoint text={t("permissions.bullet2")} />
        <BulletPoint text={t("permissions.bullet3")} />
      </View>

      <TouchableOpacity
        onPress={onRequestPermissions}
        disabled={isLoading}
        className="bg-wave-primary py-4 px-12 rounded-2xl w-full items-center"
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-lg font-semibold">
            {t("permissions.enableBluetooth")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function BulletPoint({ text }: { text: string }) {
  return (
    <View className="flex-row items-start mb-2">
      <Text className="text-wave-accent mr-2 mt-0.5">✓</Text>
      <Text className="text-wave-text text-sm flex-1">{text}</Text>
    </View>
  );
}
