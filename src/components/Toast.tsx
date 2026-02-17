import { useEffect, useCallback, useRef } from "react";
import { Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
  position?: "top" | "bottom";
}

/**
 * Auto-dismissing toast notification using Reanimated.
 * Renders as an absolute-positioned overlay — place inside a relative container.
 */
export function Toast({ message, onDismiss, durationMs = 2000, position = "bottom" }: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!message) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onDismissRef.current(), durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, durationMs]);

  if (!message) return null;

  const positionClass = position === "top"
    ? "top-16 left-6 right-6"
    : "bottom-28 left-6 right-6";

  return (
    <Animated.View
      key={message}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      className={`absolute z-50 bg-echo-surface border border-echo-muted rounded-2xl py-3 px-4 ${positionClass}`}
    >
      <Text className="text-white text-sm text-center">{message}</Text>
    </Animated.View>
  );
}
