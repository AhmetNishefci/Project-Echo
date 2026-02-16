import { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/services/supabase";
import { logger } from "@/utils/logger";

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, setSession } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace("/(main)/radar");
      return;
    }

    // Sign in anonymously - zero friction
    (async () => {
      try {
        logger.auth("Signing in anonymously...");
        const { data, error } = await supabase.auth.signInAnonymously();

        if (error) {
          logger.error("Anonymous sign-in failed", error);
          return;
        }

        if (data.session) {
          setSession(data.session);
          logger.auth("Signed in anonymously", {
            userId: data.session.user.id,
          });
          router.replace("/(main)/radar");
        }
      } catch (error) {
        logger.error("Anonymous sign-in error", error);
      }
    })();
  }, [isAuthenticated, isLoading, router, setSession]);

  return (
    <View className="flex-1 items-center justify-center bg-echo-bg">
      <Text className="text-4xl font-bold text-echo-primary mb-2">Echo</Text>
      <Text className="text-echo-muted text-base mb-8">
        Discover who's nearby
      </Text>
      <ActivityIndicator size="large" color="#6c63ff" />
      <Text className="text-echo-muted text-sm mt-4">Setting up...</Text>
    </View>
  );
}
