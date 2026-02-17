import { useEffect } from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { fetchInstagramHandle } from "@/services/profile";
import { logger } from "@/utils/logger";

const appIcon = require("../assets/icon.png");

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, setInstagramHandle } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    const navigate = async () => {
      if (!isAuthenticated) {
        logger.auth("No session, redirecting to login");
        router.replace("/login");
        return;
      }

      // Session exists — check if they have an Instagram handle
      const handle = await fetchInstagramHandle();

      if (!handle) {
        // Authenticated but no handle — send to onboarding
        logger.auth("Session valid but no handle, redirecting to onboarding");
        router.replace("/onboarding");
        return;
      }

      setInstagramHandle(handle);
      logger.auth("Session valid, navigating to radar");
      router.replace("/(main)/radar");
    };

    navigate();
  }, [isAuthenticated, isLoading, setInstagramHandle, router]);

  return (
    <View className="flex-1 items-center justify-center bg-echo-bg">
      <Image
        source={appIcon}
        className="w-20 h-20 rounded-2xl mb-5"
        resizeMode="contain"
      />
      <Text className="text-4xl font-bold text-white mb-6">Wave</Text>
      <ActivityIndicator size="small" color="#6c63ff" />
    </View>
  );
}
