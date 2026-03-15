import { View, Text, SectionList, TouchableOpacity, Share, Alert, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useWaveStore } from "@/stores/waveStore";
import { removeMatchFromServer } from "@/services/wave/waves";
import { fetchMatchesFromServer, loadMoreMatches } from "@/services/wave/matches";
import { openInstagramProfile, openSnapchatProfile } from "@/utils/deepLink";
import { BottomSheet } from "@/components/BottomSheet";
import { SocialActionRow } from "@/components/SocialActionRow";
import { COLORS } from "@/constants/colors";
import type { Match } from "@/types";
import { getAvatarForToken } from "@/types";
import i18n from "@/i18n";

/** Group matches by date with meaningful time buckets */
function groupByDate(matches: Match[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);

  // Start of this week (Monday)
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = new Date(today.getTime() - daysToMonday * 86_400_000);

  // Start of last week
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86_400_000);

  const groups: { title: string; data: Match[] }[] = [
    { title: i18n.t("history.today"), data: [] },
    { title: i18n.t("history.yesterday"), data: [] },
    { title: i18n.t("history.thisWeek"), data: [] },
    { title: i18n.t("history.lastWeek"), data: [] },
    { title: i18n.t("history.earlier"), data: [] },
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
    } else if (d >= thisWeekStart) {
      groups[2].data.push(match);
    } else if (d >= lastWeekStart) {
      groups[3].data.push(match);
    } else {
      groups[4].data.push(match);
    }
  }

  return groups.filter((g) => g.data.length > 0);
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const matches = useWaveStore((s) => s.matches);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => groupByDate(matches), [matches]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMatchesFromServer();
    setRefreshing(false);
  }, []);

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
        message: t("history.shareMessage"),
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
          <Text className="text-3xl font-bold text-white">{t("history.title")}</Text>
          <Text className="text-wave-muted text-sm mt-1">
            {matches.length === 0
              ? t("history.noMatches")
              : t("history.matchCount", { count: matches.length })}
          </Text>
        </View>
      </View>

      {matches.length === 0 ? (
        <View className="flex-1 items-center justify-center -mt-20">
          <View className="w-20 h-20 rounded-full bg-wave-surface items-center justify-center mb-4">
            <Text className="text-4xl">👋</Text>
          </View>
          <Text className="text-white text-lg font-semibold mb-2">
            {t("history.emptyTitle")}
          </Text>
          <Text className="text-wave-muted text-center text-sm px-8">
            {t("history.emptyDescription")}
          </Text>
          <TouchableOpacity
            onPress={handleInvite}
            className="mt-6 bg-wave-surface border border-wave-muted rounded-2xl py-3 px-6 flex-row items-center"
          >
            <Text className="text-lg mr-2">📲</Text>
            <Text className="text-white font-semibold text-sm">
              {t("history.inviteFriends")}
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
          renderItem={({ item }) => (
            <MatchRow match={item} onPress={setSelectedMatch} />
          )}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#6c63ff"
            />
          }
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

      {/* Match action sheet */}
      {selectedMatch && (
        <MatchActionSheet
          match={selectedMatch}
          onClose={() => setSelectedMatch(null)}
        />
      )}
    </View>
  );
}

/* ─── Match Row ─────────────────────────────────────────────── */

function MatchRow({
  match,
  onPress,
}: {
  match: Match;
  onPress: (match: Match) => void;
}) {
  const { t } = useTranslation();
  const matchDate = new Date(match.createdAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const thisWeekStart = new Date(today.getTime() - ((now.getDay() === 0 ? 6 : now.getDay() - 1) * 86_400_000));

  const timeStr = matchDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const matchLabel = matchDate >= today
    ? timeStr
    : matchDate >= yesterday
      ? timeStr
      : matchDate >= thisWeekStart
        ? `${matchDate.toLocaleDateString([], { weekday: "long" })}, ${timeStr}`
        : matchDate.getFullYear() === now.getFullYear()
          ? `${matchDate.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`
          : `${matchDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${timeStr}`;

  const igHandle = match.instagramHandle;
  const scHandle = match.snapchatHandle;
  const hasHandle = !!igHandle || !!scHandle;
  const displayName = igHandle ? `@${igHandle}` : scHandle ? scHandle : null;
  const avatar = useMemo(() => getAvatarForToken(match.matchedUserId), [match.matchedUserId]);

  return (
    <TouchableOpacity
      onPress={() => onPress(match)}
      activeOpacity={0.7}
      className="bg-wave-surface rounded-2xl p-4 mb-3 flex-row items-center"
    >
      {/* Avatar — unique per match, derived from matchedUserId */}
      <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${avatar.bg} border-2 ${avatar.ring}`}>
        <Text className="text-lg">{avatar.emoji}</Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        {hasHandle ? (
          <>
            <Text className="text-white font-semibold text-base">
              {displayName}
            </Text>
            <Text className="text-wave-muted text-xs mt-1">
              Matched {matchLabel}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-white font-semibold text-base">
              {t("history.someoneNearby")}
            </Text>
            <Text className="text-wave-muted text-xs mt-1">
              Matched {matchLabel} · {t("history.noSocials")}
            </Text>
          </>
        )}
      </View>

      {/* Platform indicators or unseen dot */}
      {hasHandle ? (
        <View className="flex-row items-center" style={{ gap: 6 }}>
          {igHandle && <Ionicons name="logo-instagram" size={16} color="#6c63ff" />}
          {scHandle && <Ionicons name="logo-snapchat" size={16} color="#FFFC00" />}
        </View>
      ) : !match.seen ? (
        <View className="w-3 h-3 rounded-full bg-wave-match" />
      ) : null}
    </TouchableOpacity>
  );
}

/* ─── Match Action Sheet (Modal) ────────────────────────────── */

function MatchActionSheet({
  match,
  onClose,
}: {
  match: Match;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const igHandle = match.instagramHandle;
  const scHandle = match.snapchatHandle;
  const displayName = igHandle ? `@${igHandle}` : scHandle ? scHandle : t("history.someoneNearby");
  const avatar = getAvatarForToken(match.matchedUserId);

  const handleRemove = () => {
    onClose();
    Alert.alert(
      t("history.removeMatch"),
      t("history.removeConfirm", { name: displayName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            const success = await removeMatchFromServer(match.matchId);
            if (!success) {
              Alert.alert(t("common.error"), t("history.removeError"));
            }
          },
        },
      ],
    );
  };

  const handleReport = () => {
    onClose();
    Linking.openURL(
      `mailto:support@wave-app.com?subject=Report%20User&body=Match%20ID:%20${match.matchId}%0APlease%20describe%20the%20issue:%0A`,
    );
  };

  return (
    <BottomSheet visible onClose={onClose}>
      {/* Match info */}
      <View className="items-center mb-5">
        <View className={`w-14 h-14 rounded-full items-center justify-center mb-3 ${avatar.bg} border-2 ${avatar.ring}`}>
          <Text className="text-2xl">{avatar.emoji}</Text>
        </View>
        <Text className="text-white text-lg font-semibold">{displayName}</Text>
      </View>

      {/* Contact options */}
      <View style={{ gap: 8 }}>
        {igHandle && (
          <SocialActionRow
            platform="instagram"
            handle={igHandle}
            onPress={() => { onClose(); openInstagramProfile(igHandle); }}
          />
        )}
        {scHandle && (
          <SocialActionRow
            platform="snapchat"
            handle={scHandle}
            onPress={() => { onClose(); openSnapchatProfile(scHandle); }}
          />
        )}
      </View>

      {/* Divider */}
      <View className="h-px bg-wave-muted/20 my-3" />

      {/* Remove */}
      <TouchableOpacity
        onPress={handleRemove}
        className="bg-wave-bg rounded-xl py-3.5 px-4 mb-2 flex-row items-center"
        activeOpacity={0.7}
        accessibilityLabel={t("history.removeMatch")}
        accessibilityRole="button"
      >
        <Ionicons name="trash-outline" size={20} color={COLORS.danger} style={{ marginRight: 12 }} />
        <Text className="text-wave-danger text-sm font-semibold">{t("history.removeMatch")}</Text>
      </TouchableOpacity>

      {/* Report */}
      <TouchableOpacity
        onPress={handleReport}
        className="bg-wave-bg rounded-xl py-3.5 px-4 mb-2 flex-row items-center"
        activeOpacity={0.7}
        accessibilityLabel={t("history.reportUser")}
        accessibilityRole="button"
      >
        <Ionicons name="flag-outline" size={20} color={COLORS.text} style={{ marginRight: 12 }} />
        <Text className="text-wave-text text-sm font-semibold">{t("history.reportUser")}</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}
