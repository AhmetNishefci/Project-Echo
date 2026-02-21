import { useEffect, useRef, useState } from "react";
import { View, Text, Image, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { fetchProfile } from "@/services/profile";
import { logger } from "@/utils/logger";

const appIcon = require("../assets/icon.png");

const MAX_PROFILE_RETRIES = 3;

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, setInstagramHandle, setGender, setGenderPreference } = useAuthStore();
  const [fetchFailed, setFetchFailed] = useState(false);
  const retryCount = useRef(0);

  useEffect(() => {
    if (isLoading) return;

    retryCount.current = 0;
    setFetchFailed(false);
    navigate();

    function navigate() {
      if (!isAuthenticated) {
        logger.auth("No session, redirecting to login");
        router.replace("/login");
        return;
      }

      // Session exists — fetch full profile
      fetchProfile().then((profile) => {
        if (!profile) {
          retryCount.current += 1;
          if (retryCount.current <= MAX_PROFILE_RETRIES) {
            const delay = 2000 * retryCount.current;
            logger.error(`Failed to fetch profile, retry ${retryCount.current}/${MAX_PROFILE_RETRIES} in ${delay}ms`);
            setTimeout(() => navigate(), delay);
          } else {
            logger.error("All profile fetch retries exhausted");
            setFetchFailed(true);
          }
          return;
        }

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
        logger.auth("Session valid, navigating to radar");
        router.replace("/(main)/radar");
      });
    }
  }, [isAuthenticated, isLoading, setInstagramHandle, setGender, setGenderPreference, router]);

  const handleRetry = () => {
    retryCount.current = 0;
    setFetchFailed(false);
    // Re-trigger useEffect by forcing a state cycle isn't needed —
    // the effect depends on isAuthenticated/isLoading which haven't changed.
    // Instead, just call navigate directly via fetchProfile.
    fetchProfile().then((profile) => {
      if (!profile) {
        setFetchFailed(true);
        return;
      }
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
      router.replace("/(main)/radar");
    });
  };

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
            className="bg-echo-primary rounded-xl px-6 py-3"
          >
            <Text className="text-white text-sm font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ActivityIndicator size="small" color="#6c63ff" />
      )}
    </View>
  );
}
