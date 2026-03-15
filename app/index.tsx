import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Image, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { fetchProfile, syncTimezoneAndActivity } from "@/services/profile";
import { fetchMatchesFromServer } from "@/services/wave/matches";
import { logger } from "@/utils/logger";
import { isAtLeastAge } from "@/utils/age";
import { impactMedium } from "@/utils/haptics";

const waveHand = require("../assets/wave-hand.png");

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

  /**
   * Shared routing logic: hydrates auth store from profile and navigates
   * to the appropriate screen based on onboarding completeness.
   */
  const routeFromProfile = useCallback(
    (profile: NonNullable<Awaited<ReturnType<typeof fetchProfile>>>) => {
      const { setDateOfBirth, setGender, setGenderPreference, setAgePreference, setInstagramHandle, setSnapchatHandle, setNote, setNearbyAlertsEnabled, setDailyPushesEnabled } =
        useAuthStore.getState();

      // Age check — must happen before all other onboarding steps
      if (!profile.dateOfBirth) {
        logger.auth("No DOB, redirecting to birthday");
        router.replace("/birthday");
        return;
      }

      // Check if user is under 18 based on stored DOB
      if (!isAtLeastAge(new Date(profile.dateOfBirth + "T00:00:00"), 18)) {
        logger.auth("User under 18, redirecting to age-blocked");
        setDateOfBirth(profile.dateOfBirth);
        router.replace("/age-blocked");
        return;
      }

      setDateOfBirth(profile.dateOfBirth);

      if (!profile.gender) {
        logger.auth("No gender, redirecting to gender");
        router.replace("/gender");
        return;
      }

      setGender(profile.gender);
      setGenderPreference(profile.genderPreference);
      setAgePreference(profile.agePreferenceMin, profile.agePreferenceMax);

      if (!profile.instagramHandle && !profile.snapchatHandle) {
        logger.auth("No contact handles, redirecting to onboarding");
        router.replace("/onboarding");
        return;
      }

      setInstagramHandle(profile.instagramHandle);
      setSnapchatHandle(profile.snapchatHandle);
      setNote(profile.note);
      setNearbyAlertsEnabled(profile.nearbyAlertsEnabled);
      setDailyPushesEnabled(profile.dailyPushesEnabled);

      if (!profile.nearbyAlertsOnboarded) {
        logger.auth("Nearby alerts not configured, redirecting");
        router.replace("/nearby-alerts");
        return;
      }

      // Background syncs (non-blocking)
      syncTimezoneAndActivity().catch((err) =>
        logger.error("Timezone/activity sync failed", err),
      );
      fetchMatchesFromServer().catch((err) =>
        logger.error("Background match fetch failed", err),
      );

      logger.auth("Session valid, navigating to radar");
      router.replace("/(main)/radar");
    },
    [router],
  );

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

      routeFromProfile(profile);
    },
    [routeFromProfile],
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
    impactMedium();
    setIsNavigating(true);
    setFetchFailed(false);

    const profile = await fetchProfile();

    // Bail if auth state changed during fetch (L4 fix) — the main
    // effect will handle navigation when isAuthenticated updates.
    if (!useAuthStore.getState().isAuthenticated) {
      setIsNavigating(false);
      return;
    }

    if (!profile) {
      setFetchFailed(true);
      setIsNavigating(false);
      return;
    }

    routeFromProfile(profile);
  }, [isNavigating, routeFromProfile]);

  return (
    <View className="flex-1 items-center justify-center bg-wave-bg">
      <Image
        source={waveHand}
        style={{ width: 80, height: 80 }}
        resizeMode="contain"
      />
      <Text className="text-4xl font-bold text-white mb-6">Wave</Text>
      {fetchFailed ? (
        <View className="items-center">
          <Text className="text-wave-muted text-sm mb-4">
            Could not connect. Check your internet and try again.
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            disabled={isNavigating}
            className="bg-wave-primary rounded-xl px-6 py-3"
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
