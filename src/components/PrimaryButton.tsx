import { TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { COLORS } from "@/constants/colors";

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline";
  accessibilityLabel?: string;
}

/**
 * Shared CTA button used across onboarding and other screens.
 * Handles enabled/disabled/loading states consistently.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  accessibilityLabel,
}: PrimaryButtonProps) {
  const isActive = !disabled && !loading;
  const isPrimary = variant === "primary";

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      className={`w-full rounded-2xl py-4 items-center justify-center ${
        isPrimary
          ? isActive ? "bg-wave-primary" : "bg-wave-surface"
          : "border border-wave-muted/50"
      }`}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} size="small" />
      ) : (
        <Text
          className={`text-base font-semibold ${
            isPrimary
              ? isActive ? "text-white" : "text-wave-muted"
              : "text-wave-muted"
          }`}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
