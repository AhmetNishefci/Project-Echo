import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/constants/colors";

type Platform = "instagram" | "snapchat";

const PLATFORM_CONFIG: Record<Platform, { icon: "logo-instagram" | "logo-snapchat"; color: string; labelKey: string; prefix: string }> = {
  instagram: { icon: "logo-instagram", color: COLORS.primary, labelKey: "social.openInstagram", prefix: "@" },
  snapchat: { icon: "logo-snapchat", color: COLORS.snapchat, labelKey: "social.openSnapchat", prefix: "" },
};

interface SocialActionRowProps {
  platform: Platform;
  handle: string;
  onPress: () => void;
}

/**
 * Shared action row for opening a social platform profile.
 * Shows platform icon, "Open [Platform]" label, handle subtitle, and external link icon.
 */
export function SocialActionRow({ platform, handle, onPress }: SocialActionRowProps) {
  const { t } = useTranslation();
  const config = PLATFORM_CONFIG[platform];
  const label = t(config.labelKey);

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-wave-bg rounded-xl py-3.5 px-4 flex-row items-center"
      activeOpacity={0.7}
      accessibilityLabel={`${label} ${config.prefix}${handle}`}
      accessibilityRole="button"
    >
      <Ionicons name={config.icon} size={20} color={config.color} style={{ marginRight: 12 }} />
      <View className="flex-1">
        <Text className="text-white text-sm font-semibold">{label}</Text>
        <Text className="text-wave-muted text-xs mt-0.5">{config.prefix}{handle}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={COLORS.muted} />
    </TouchableOpacity>
  );
}
