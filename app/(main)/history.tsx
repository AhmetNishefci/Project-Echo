import { View, Text, SectionList, TouchableOpacity, Share, Alert, ActionSheetIOS, Platform, ActivityIndicator, Linking } from "react-native";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { useWaveStore } from "@/stores/waveStore";
import { removeMatchFromServer } from "@/services/wave/waves";
import { loadMoreMatches } from "@/services/wave/matches";
import { openInstagramProfile, openSnapchatProfile } from "@/utils/deepLink";
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
  const matches = useWaveStore((s) => s.matches);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sections = useMemo(() => groupByDate(matches), [matches]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || matches.length === 0) return;

    // Use oldest match's createdAt as cursor
    const sorted = [...matches].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const cursor = sorted[0].createdAt;

    setLoadingMore(true);
    try {
      const more = await loadMoreMatches(cursor);
      setHasMore(more);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, matches]);

  // Mark all unseen matches as seen when this screen is visible (L13 fix)
  // Track which match IDs we've already marked to avoid re-running,
  // but allow new unseen matches to be marked if they arrive while mounted.
  const seenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unseen = matches.filter(
      (m) => !m.seen && !seenIdsRef.current.has(m.matchId),
    );
    if (unseen.length > 0) {
      const store = useWaveStore.getState();
      for (const m of unseen) {
        store.markMatchSeen(m.matchId);
        seenIdsRef.current.add(m.matchId);
      }
    }
  }, [matches]);

  const handleInvite = async () => {
    try {
      await Share.share({
        message:
          "I'm using Wave to connect with people nearby! Download it and wave at me 👋",
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <View className="flex-1 bg-wave-bg pt-16 px-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-3xl font-bold text-white">Matches</Text>
          <Text className="text-wave-muted text-sm mt-1">
            {matches.length === 0
              ? "No matches yet"
              : `${matches.length} ${matches.length === 1 ? "match" : "matches"} total`}
          </Text>
        </View>
      </View>

      {matches.length === 0 ? (
        <View className="flex-1 items-center justify-center -mt-20">
          <View className="w-20 h-20 rounded-full bg-wave-surface items-center justify-center mb-4">
            <Text className="text-4xl">👋</Text>
          </View>
          <Text className="text-white text-lg font-semibold mb-2">
            No matches yet
          </Text>
          <Text className="text-wave-muted text-center text-sm px-8">
            When you and someone nearby both wave at each other, you'll match
            and they'll appear here.
          </Text>
          <TouchableOpacity
            onPress={handleInvite}
            className="mt-6 bg-wave-surface border border-wave-muted rounded-2xl py-3 px-6 flex-row items-center"
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
            <Text className="text-wave-muted text-xs uppercase tracking-wider mb-2 mt-4">
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => <MatchRow match={item} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#666680" />
              </View>
            ) : null
          }
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

  const igHandle = match.instagramHandle;
  const scHandle = match.snapchatHandle;
  const hasHandle = !!igHandle || !!scHandle;
  // Display name: prefer Instagram, fallback to Snapchat
  const displayName = igHandle ? `@${igHandle}` : scHandle ? scHandle : null;

  const openPrimaryContact = useCallback(() => {
    if (igHandle) openInstagramProfile(igHandle);
    else if (scHandle) openSnapchatProfile(scHandle);
  }, [igHandle, scHandle]);

  const handleRemove = useCallback(() => {
    Alert.alert(
      "Remove Match",
      displayName
        ? `Remove ${displayName}? This removes the match for both of you.`
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
  }, [match.matchId, displayName]);

  const handleReport = useCallback(() => {
    Linking.openURL(
      `mailto:support@wave-app.com?subject=Report%20User&body=Match%20ID:%20${match.matchId}%0APlease%20describe%20the%20issue:%0A`,
    );
  }, [match.matchId]);

  const showActions = useCallback(() => {
    if (Platform.OS === "ios") {
      const options: string[] = [];
      if (igHandle) options.push("Open Instagram");
      if (scHandle) options.push("Open Snapchat");
      options.push("Remove Match", "Report User", "Cancel");

      const cancelIndex = options.length - 1;
      const destructiveIndex = options.indexOf("Remove Match");

      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        (index) => {
          const selected = options[index];
          if (selected === "Open Instagram" && igHandle) {
            openInstagramProfile(igHandle);
          } else if (selected === "Open Snapchat" && scHandle) {
            openSnapchatProfile(scHandle);
          } else if (selected === "Remove Match") {
            handleRemove();
          } else if (selected === "Report User") {
            handleReport();
          }
        },
      );
    } else {
      Alert.alert("Match Options", undefined, [
        ...(igHandle ? [{ text: "Open Instagram", onPress: () => openInstagramProfile(igHandle) }] : []),
        ...(scHandle ? [{ text: "Open Snapchat", onPress: () => openSnapchatProfile(scHandle) }] : []),
        { text: "Remove Match", style: "destructive" as const, onPress: () => handleRemove() },
        { text: "Report User", onPress: handleReport },
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }, [igHandle, scHandle, handleRemove, handleReport]);

  return (
    <TouchableOpacity
      onPress={hasHandle ? openPrimaryContact : showActions}
      onLongPress={showActions}
      activeOpacity={0.7}
      className="bg-wave-surface rounded-2xl p-4 mb-3 flex-row items-center"
    >
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-wave-match/20 items-center justify-center mr-4">
        <Text className="text-wave-match text-lg">🤝</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        {hasHandle ? (
          <>
            <Text className="text-white font-semibold text-base">
              {displayName}
            </Text>
            <Text className="text-wave-muted text-xs mt-1">
              Matched at {time}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-white font-semibold text-base">
              Someone nearby
            </Text>
            <Text className="text-wave-muted text-xs mt-1">
              Matched at {time} · No socials linked
            </Text>
          </>
        )}
      </View>

      {/* Platform indicators or unseen dot */}
      {hasHandle ? (
        <View className="flex-row items-center" style={{ gap: 4 }}>
          {igHandle && <Text className="text-xs">📸</Text>}
          {scHandle && <Text className="text-xs">👻</Text>}
        </View>
      ) : !match.seen ? (
        <View className="w-3 h-3 rounded-full bg-wave-match" />
      ) : null}
    </TouchableOpacity>
  );
}
