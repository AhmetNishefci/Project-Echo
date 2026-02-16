import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useEchoStore } from "@/stores/echoStore";

export default function MatchScreen() {
  const router = useRouter();
  const latestUnseenMatch = useEchoStore((s) => s.latestUnseenMatch);
  const markMatchSeen = useEchoStore((s) => s.markMatchSeen);

  const handleDismiss = () => {
    if (latestUnseenMatch) {
      markMatchSeen(latestUnseenMatch.matchId);
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-echo-bg items-center justify-center px-8">
      {/* Celebration visual */}
      <View className="w-32 h-32 rounded-full bg-echo-match/20 items-center justify-center mb-8">
        <View className="w-24 h-24 rounded-full bg-echo-match/40 items-center justify-center">
          <View className="w-16 h-16 rounded-full bg-echo-match items-center justify-center">
            <Text className="text-4xl">{"<>"}</Text>
          </View>
        </View>
      </View>

      {/* Match text */}
      <Text className="text-4xl font-bold text-white mb-2">It's a Match!</Text>
      <Text className="text-echo-muted text-center text-base mb-2">
        You both waved at each other
      </Text>

      {latestUnseenMatch && (
        <Text className="text-echo-accent text-sm mb-8">
          Echo #{latestUnseenMatch.matchedUserId.substring(0, 8).toUpperCase()}
        </Text>
      )}

      <Text className="text-echo-muted text-center text-sm mb-12 px-4">
        Chat feature coming soon. For now, you've made a connection!
      </Text>

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={handleDismiss}
        className="bg-echo-primary py-4 px-12 rounded-2xl"
      >
        <Text className="text-white text-lg font-semibold">
          Back to Radar
        </Text>
      </TouchableOpacity>
    </View>
  );
}
