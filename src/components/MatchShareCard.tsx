import { useRef, useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { impactMedium } from "@/utils/haptics";
import { COLORS } from "@/constants/colors";
import { getIcebreakerForMatch } from "@/constants/icebreakers";
import { logger } from "@/utils/logger";

const waveHand = require("../../assets/wave-hand.png");

interface MatchShareCardProps {
  matchId: string;
}

/**
 * "Share Match" button + hidden card that captures a branded image
 * for sharing to Instagram/Snapchat stories. The card is rendered
 * off-screen, captured as a PNG, then shared via the native share sheet.
 *
 * The card is intentionally generic — no handles or usernames to
 * protect the privacy of both users.
 */
export function MatchShareCard({ matchId }: MatchShareCardProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  const icebreaker = getIcebreakerForMatch(matchId);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    impactMedium();

    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        logger.error("MatchShareCard: capture returned no URI");
        setSharing(false);
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share your match",
      });
    } catch (err) {
      logger.error("MatchShareCard: share failed", err);
    } finally {
      setSharing(false);
    }
  }, [sharing]);

  return (
    <>
      {/* Share button — visible */}
      <TouchableOpacity
        onPress={handleShare}
        disabled={sharing}
        className="flex-row items-center justify-center py-3"
        activeOpacity={0.7}
        accessibilityLabel="Share match to story"
        accessibilityRole="button"
      >
        {sharing ? (
          <ActivityIndicator size="small" color={COLORS.muted} />
        ) : (
          <>
            <Ionicons name="share-outline" size={16} color={COLORS.muted} style={{ marginRight: 6 }} />
            <Text className="text-wave-muted text-sm font-semibold">Share to Story</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Card — rendered off-screen, captured as image */}
      <View style={{ position: "absolute", left: -9999, top: -9999 }}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: "png", quality: 1, width: 1080, height: 1920 }}
        >
          <View
            style={{
              width: 1080,
              height: 1920,
              backgroundColor: COLORS.bg,
              alignItems: "center",
              justifyContent: "center",
              padding: 80,
            }}
          >
            {/* Glow */}
            <View
              style={{
                position: "absolute",
                width: 400,
                height: 400,
                borderRadius: 200,
                backgroundColor: COLORS.primary,
                opacity: 0.08,
              }}
            />

            {/* Wave hand */}
            <Image
              source={waveHand}
              style={{ width: 240, height: 240, marginBottom: 60 }}
              resizeMode="contain"
            />

            {/* Title */}
            <Text
              style={{
                color: "#ffffff",
                fontSize: 72,
                fontWeight: "800",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              It's a Match!
            </Text>

            {/* Subtitle */}
            <Text
              style={{
                color: COLORS.muted,
                fontSize: 36,
                textAlign: "center",
                marginBottom: 80,
                lineHeight: 52,
                paddingHorizontal: 40,
              }}
            >
              We both waved at each other on Wave 👋
            </Text>

            {/* Ice-breaker */}
            <View
              style={{
                backgroundColor: "rgba(108, 99, 255, 0.1)",
                borderRadius: 32,
                paddingHorizontal: 48,
                paddingVertical: 32,
                borderWidth: 2,
                borderColor: "rgba(108, 99, 255, 0.2)",
                marginBottom: 80,
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 30,
                  textAlign: "center",
                  fontStyle: "italic",
                  lineHeight: 44,
                }}
              >
                "{icebreaker}"
              </Text>
            </View>

            {/* Branding */}
            <Text
              style={{
                color: COLORS.primary,
                fontSize: 42,
                fontWeight: "700",
                letterSpacing: 2,
              }}
            >
              WAVE
            </Text>
            <Text
              style={{
                color: COLORS.muted,
                fontSize: 24,
                marginTop: 12,
              }}
            >
              Connect with people nearby
            </Text>
          </View>
        </ViewShot>
      </View>
    </>
  );
}
