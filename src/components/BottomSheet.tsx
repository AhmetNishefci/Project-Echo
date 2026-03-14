import { Modal, Pressable, View } from "react-native";
import type { ReactNode } from "react";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Shared bottom sheet modal with backdrop dismiss.
 * Tap outside the sheet to close. Used by PeerDetailModal and MatchActionSheet.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-black/60 justify-end"
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Pressable onPress={(e) => e.stopPropagation()} className="bg-wave-surface rounded-t-3xl px-6 pt-6 pb-10">
          {/* Handle bar */}
          <View className="w-10 h-1 rounded-full bg-wave-muted/40 self-center mb-5" />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
