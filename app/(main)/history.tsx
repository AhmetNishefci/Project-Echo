import { View, Text, SectionList, TouchableOpacity, Linking, Share, Alert, ActionSheetIOS, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useEffect, useRef, useCallback } from "react";
import { useEchoStore } from "@/stores/echoStore";
import { removeMatchFromServer } from "@/services/echo/waves";
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
  const didMarkSeen = useRef(false);
  useEffect(() => {
    if (didMarkSeen.current) return;
    const unseen = matches.filter((m) => !m.seen);
    if (unseen.length > 0) {
      didMarkSeen.current = true;
      const store = useEchoStore.getState();
      for (const m of unseen) {
        store.markMatchSeen(m.matchId);
      }
    }
  }, [matches]);

  const handleInvite = async () => {
    try {
      await Share.share({
        message:
          "I'm using Echo to connect with people nearby! Download it and wave at me 👋",
      });
    } catch {
      // User cancelled share
    }
  };

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
          <TouchableOpacity
            onPress={handleInvite}
            className="mt-6 bg-echo-surface border border-echo-muted rounded-2xl py-3 px-6 flex-row items-center"
          >
            <Text className="text-lg mr-2">📲</Text>
            <Text className="text-white font-semibold text-sm">
              Invite Friends Nearby
            </Text>
          </TouchableOpacity>
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
  const time = new Date(match.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handle = match.instagramHandle;

  const openInstagram = useCallback(() => {
    if (!handle) return;
    Linking.openURL(`instagram://user?username=${handle}`).catch(() => {
      Linking.openURL(`https://instagram.com/${handle}`);
    });
  }, [handle]);

  const handleRemove = useCallback(() => {
    Alert.alert(
      "Remove Match",
      handle
        ? `Remove @${handle}? This removes the match for both of you.`
        : "Remove this match? This removes it for both of you.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const success = await removeMatchFromServer(match.matchId);
            if (!success) {
              Alert.alert("Error", "Could not remove the match. Try again.");
            }
          },
        },
      ],
    );
  }, [match.matchId, handle]);

  const handleReport = useCallback(() => {
    Linking.openURL(
      `mailto:support@echo-app.com?subject=Report%20User&body=Match%20ID:%20${match.matchId}%0APlease%20describe%20the%20issue:%0A`,
    );
  }, [match.matchId]);

  const showActions = useCallback(() => {
    if (Platform.OS === "ios") {
      const options = handle
        ? ["Open Instagram", "Remove Match", "Report User", "Cancel"]
        : ["Remove Match", "Report User", "Cancel"];
      const cancelIndex = options.length - 1;
      const destructiveIndex = handle ? 1 : 0;

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (index) => {
          if (handle) {
            if (index === 0) openInstagram();
            else if (index === 1) handleRemove();
            else if (index === 2) handleReport();
          } else {
            if (index === 0) handleRemove();
            else if (index === 1) handleReport();
          }
        },
      );
    } else {
      // Android fallback — use Alert with buttons
      Alert.alert("Match Options", undefined, [
        ...(handle
          ? [{ text: "Open Instagram", onPress: openInstagram }]
          : []),
        { text: "Remove Match", style: "destructive" as const, onPress: () => handleRemove() },
        { text: "Report User", onPress: handleReport },
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }, [handle, openInstagram, handleRemove, handleReport]);

  return (
    <TouchableOpacity
      onPress={handle ? openInstagram : showActions}
      onLongPress={showActions}
      activeOpacity={0.7}
      className="bg-echo-surface rounded-2xl p-4 mb-3 flex-row items-center"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-echo-match/20 items-center justify-center mr-4">
        <Text className="text-echo-match text-lg">🤝</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        {handle ? (
          <>
            <Text className="text-white font-semibold text-base">
              @{handle}
            </Text>
            <Text className="text-echo-muted text-xs mt-1">
              Matched at {time}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-white font-semibold text-base">
              Someone nearby
            </Text>
            <Text className="text-echo-muted text-xs mt-1">
              Matched at {time} · No Instagram linked
            </Text>
          </>
        )}
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
