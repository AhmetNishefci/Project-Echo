import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/services/supabase";
import { fetchInstagramHandle } from "@/services/profile";
import { logger } from "@/utils/logger";

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, setSession, setInstagramHandle, hasCompletedOnboarding } =
    useAuthStore();
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const navigate = async () => {
      let authenticated = isAuthenticated;

      // Sign in anonymously if needed
      if (!authenticated) {
        try {
          setAuthError(false);
          logger.auth("Signing in anonymously...");
          const { data, error } = await supabase.auth.signInAnonymously();

          if (error) {
            logger.error("Anonymous sign-in failed", error);
            setAuthError(true);
            return;
          }

          if (data.session) {
            setSession(data.session);
            logger.auth("Signed in anonymously", {
              userId: data.session.user.id,
            });
            authenticated = true;
          }
        } catch (error) {
          logger.error("Anonymous sign-in error", error);
          setAuthError(true);
          return;
        }
      }

      if (!authenticated) return;

      // Check if user already has an Instagram handle
      if (!hasCompletedOnboarding) {
        const handle = await fetchInstagramHandle();
        if (handle) {
          setInstagramHandle(handle);
          router.replace("/(main)/radar");
        } else {
          router.replace("/onboarding");
        }
      } else {
        router.replace("/(main)/radar");
      }
    };

    navigate();
  }, [isAuthenticated, isLoading, hasCompletedOnboarding, setSession, setInstagramHandle, router]);

  return (
    <View className="flex-1 items-center justify-center bg-echo-bg">
      <Text className="text-4xl font-bold text-echo-primary mb-2">Echo</Text>
      <Text className="text-echo-muted text-base mb-8">
        Discover who's nearby
      </Text>
      {authError ? (
        <>
          <Text className="text-echo-danger text-sm mb-4">Could not connect. Check your internet.</Text>
          <TouchableOpacity
            onPress={() => {
              setAuthError(false);
              useAuthStore.getState().setLoading(true);
              // Trigger re-run of effect
              setTimeout(() => useAuthStore.getState().setLoading(false), 100);
            }}
            className="bg-echo-primary py-3 px-8 rounded-2xl"
          >
            <Text className="text-white text-base font-semibold">Retry</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#6c63ff" />
          <Text className="text-echo-muted text-sm mt-4">Setting up...</Text>
        </>
      )}
    </View>
  );
}
