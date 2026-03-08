import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Image, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { fetchProfile, syncTimezoneAndActivity } from "@/services/profile";
import { fetchMatchesFromServer } from "@/services/echo/matches";
import { logger } from "@/utils/logger";

const appIcon = require("../assets/icon.png");

const MAX_PROFILE_RETRIES = 3;

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [fetchFailed, setFetchFailed] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Ref to track whether the current effect/retry chain is still valid.
  // Incremented on every new effect run so stale closures can bail out.
  const generationRef = useRef(0);

  // Ref to hold pending timeout IDs for cleanup (C2 fix)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateWithProfile = useCallback(
    async (generation: number, retryCount: number) => {
      // Bail out if a newer effect run has started (C3 fix)
      if (generation !== generationRef.current) return;

      const profile = await fetchProfile();

      // Check again after async gap
      if (generation !== generationRef.current) return;

      if (!profile) {
        if (retryCount < MAX_PROFILE_RETRIES) {
          const nextRetry = retryCount + 1;
          const delay = 2000 * nextRetry;
          logger.error(
            `Failed to fetch profile, retry ${nextRetry}/${MAX_PROFILE_RETRIES} in ${delay}ms`,
          );
          timerRef.current = setTimeout(
            () => navigateWithProfile(generation, nextRetry),
            delay,
          );
        } else {
          logger.error("All profile fetch retries exhausted");
          setFetchFailed(true);
        }
        return;
      }

      const { setGender, setGenderPreference, setInstagramHandle, setNote, setNearbyAlertsEnabled, setDailyPushesEnabled } =
        useAuthStore.getState();

      if (!profile.gender) {
        logger.auth("Session valid but no gender, redirecting to gender");
        router.replace("/gender");
        return;
      }

      setGender(profile.gender);
      setGenderPreference(profile.genderPreference);

      if (!profile.instagramHandle) {
        logger.auth("Session valid but no handle, redirecting to onboarding");
        router.replace("/onboarding");
        return;
      }

      setInstagramHandle(profile.instagramHandle);
      setNote(profile.note);
      setNearbyAlertsEnabled(profile.nearbyAlertsEnabled);
      setDailyPushesEnabled(profile.dailyPushesEnabled);

      // Check if user has completed nearby alerts onboarding
      if (!profile.nearbyAlertsOnboarded) {
        logger.auth("Session valid but nearby alerts not configured, redirecting");
        router.replace("/nearby-alerts");
        return;
      }

      // Sync timezone and activity in background (for engagement notifications)
      syncTimezoneAndActivity().catch((err) =>
        logger.error("Timezone/activity sync failed", err),
      );

      // Fetch matches from server in background to sync match history
      fetchMatchesFromServer().catch((err) =>
        logger.error("Background match fetch failed", err),
      );

      logger.auth("Session valid, navigating to radar");
      router.replace("/(main)/radar");
    },
    [router],
  );

  useEffect(() => {
    if (isLoading) return;

    // Increment generation to invalidate any in-flight retries from
    // a previous effect run (C3 fix)
    const generation = ++generationRef.current;
    setFetchFailed(false);
    setIsNavigating(false);

    if (!isAuthenticated) {
      logger.auth("No session, redirecting to login");
      router.replace("/login");
      return;
    }

    navigateWithProfile(generation, 0);

    // Cleanup: clear any pending timer on unmount or dep change (C2 fix)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAuthenticated, isLoading, router, navigateWithProfile]);

  // Retry handler with guard against concurrent taps (H3 fix)
  const handleRetry = useCallback(async () => {
    if (isNavigating) return;
    setIsNavigating(true);
    setFetchFailed(false);

    const profile = await fetchProfile();

    if (!profile) {
      setFetchFailed(true);
      setIsNavigating(false);
      return;
    }

    const { setGender, setGenderPreference, setInstagramHandle, setNote, setNearbyAlertsEnabled, setDailyPushesEnabled } =
      useAuthStore.getState();

    if (!profile.gender) {
      router.replace("/gender");
      return;
    }
    setGender(profile.gender);
    setGenderPreference(profile.genderPreference);

    if (!profile.instagramHandle) {
      router.replace("/onboarding");
      return;
    }
    setInstagramHandle(profile.instagramHandle);
    setNote(profile.note);
    setNearbyAlertsEnabled(profile.nearbyAlertsEnabled);
    setDailyPushesEnabled(profile.dailyPushesEnabled);

    if (!profile.nearbyAlertsOnboarded) {
      router.replace("/nearby-alerts");
      return;
    }

    syncTimezoneAndActivity().catch(() => {});
    router.replace("/(main)/radar");
  }, [isNavigating, router]);

  return (
    <View className="flex-1 items-center justify-center bg-echo-bg">
      <Image
        source={appIcon}
        className="w-20 h-20 rounded-2xl mb-5"
        resizeMode="contain"
      />
      <Text className="text-4xl font-bold text-white mb-6">Wave</Text>
      {fetchFailed ? (
        <View className="items-center">
          <Text className="text-echo-muted text-sm mb-4">
            Could not connect. Check your internet and try again.
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            disabled={isNavigating}
            className="bg-echo-primary rounded-xl px-6 py-3"
          >
            {isNavigating ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white text-sm font-semibold">Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ActivityIndicator size="small" color="#6c63ff" />
      )}
    </View>
  );
}
