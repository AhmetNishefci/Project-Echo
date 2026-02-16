import { View, Text, SectionList, TouchableOpacity, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useEffect, useRef } from "react";
import { useEchoStore } from "@/stores/echoStore";
import type { Match } from "@/types";

/** Group matches by date (Today, Yesterday, Earlier) */
function groupByDate(matches: Match[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);

  const groups: { title: string; data: Match[] }[] = [
    { title: "Today", data: [] },
    { title: "Yesterday", data: [] },
    { title: "Earlier", data: [] },
  ];

  // Sort newest first
  const sorted = [...matches].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const match of sorted) {
    const d = new Date(match.createdAt);
    if (d >= today) {
      groups[0].data.push(match);
    } else if (d >= yesterday) {
      groups[1].data.push(match);
    } else {
      groups[2].data.push(match);
    }
  }

  return groups.filter((g) => g.data.length > 0);
}

export default function HistoryScreen() {
  const router = useRouter();
  const matches = useEchoStore((s) => s.matches);

  const sections = useMemo(() => groupByDate(matches), [matches]);

  // Mark all unseen matches as seen when this screen mounts
  const hasMarkedSeen = useRef(false);
  useEffect(() => {
    const unseen = matches.filter((m) => !m.seen);
    if (unseen.length > 0 && !hasMarkedSeen.current) {
      hasMarkedSeen.current = true;
      const store = useEchoStore.getState();
      for (const m of unseen) {
        store.markMatchSeen(m.matchId);
      }
    }
    // Reset when new unseen matches arrive (component still mounted)
    if (unseen.length > 0) {
      hasMarkedSeen.current = true;
    } else {
      hasMarkedSeen.current = false;
    }
  }, [matches]);

  return (
    <View className="flex-1 bg-echo-bg pt-16 px-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-3xl font-bold text-white">Matches</Text>
          <Text className="text-echo-muted text-sm mt-1">
            {matches.length === 0
              ? "No matches yet"
              : `${matches.length} ${matches.length === 1 ? "match" : "matches"} total`}
          </Text>
        </View>
      </View>

      {matches.length === 0 ? (
        <View className="flex-1 items-center justify-center -mt-20">
          <View className="w-20 h-20 rounded-full bg-echo-surface items-center justify-center mb-4">
            <Text className="text-4xl">👋</Text>
          </View>
          <Text className="text-white text-lg font-semibold mb-2">
            No matches yet
          </Text>
          <Text className="text-echo-muted text-center text-sm px-8">
            When you and someone nearby both wave at each other, you'll match
            and they'll appear here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.matchId}
          renderSectionHeader={({ section }) => (
            <Text className="text-echo-muted text-xs uppercase tracking-wider mb-2 mt-4">
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => <MatchRow match={item} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

function MatchRow({ match }: { match: Match }) {
  const shortId = match.matchedUserId.substring(0, 8).toUpperCase();
  const time = new Date(match.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handle = match.instagramHandle;

  const openInstagram = () => {
    if (!handle) return;
    Linking.openURL(`instagram://user?username=${handle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${handle}`);
    });
  };

  return (
    <TouchableOpacity
      onPress={handle ? openInstagram : undefined}
      activeOpacity={handle ? 0.7 : 1}
      className="bg-echo-surface rounded-2xl p-4 mb-3 flex-row items-center"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-echo-match/20 items-center justify-center mr-4">
        <Text className="text-echo-match text-lg">🤝</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-white font-semibold text-base">
          {handle ? `@${handle}` : `Echo #${shortId}`}
        </Text>
        <Text className="text-echo-muted text-xs mt-1">
          Matched at {time}
        </Text>
      </View>

      {/* Instagram indicator or unseen dot */}
      {handle ? (
        <Text className="text-echo-muted text-xs">📸</Text>
      ) : !match.seen ? (
        <View className="w-3 h-3 rounded-full bg-echo-match" />
      ) : null}
    </TouchableOpacity>
  );
}
