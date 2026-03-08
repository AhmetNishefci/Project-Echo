import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Gender, GenderPreference } from "@/types";

interface AuthState {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  instagramHandle: string | null;
  gender: Gender | null;
  genderPreference: GenderPreference | null;
  note: string | null;
  nearbyAlertsEnabled: boolean;

  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setInstagramHandle: (handle: string | null) => void;
  setGender: (gender: Gender | null) => void;
  setGenderPreference: (pref: GenderPreference | null) => void;
  setNote: (note: string | null) => void;
  setNearbyAlertsEnabled: (enabled: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  userId: null,
  isLoading: true,
  isAuthenticated: false,
  instagramHandle: null,
  gender: null,
  genderPreference: null,
  note: null,
  nearbyAlertsEnabled: true,

  setSession: (session) =>
    set({
      session,
      userId: session?.user?.id ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setInstagramHandle: (instagramHandle) => set({ instagramHandle }),

  setGender: (gender) => set({ gender }),

  setGenderPreference: (genderPreference) => set({ genderPreference }),

  setNote: (note) => set({ note }),

  setNearbyAlertsEnabled: (nearbyAlertsEnabled) => set({ nearbyAlertsEnabled }),

  reset: () =>
    set({
      session: null,
      userId: null,
      isLoading: false,
      isAuthenticated: false,
      instagramHandle: null,
      gender: null,
      genderPreference: null,
      note: null,
      nearbyAlertsEnabled: true,
    }),
}));
