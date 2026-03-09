import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Gender, GenderPreference } from "@/types";

interface AuthState {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  dateOfBirth: string | null;
  instagramHandle: string | null;
  gender: Gender | null;
  age: number | null;
  genderPreference: GenderPreference | null;
  agePreferenceMin: number | null;
  agePreferenceMax: number | null;
  note: string | null;
  nearbyAlertsEnabled: boolean;
  dailyPushesEnabled: boolean;

  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setDateOfBirth: (dob: string | null) => void;
  setInstagramHandle: (handle: string | null) => void;
  setGender: (gender: Gender | null) => void;
  setAge: (age: number | null) => void;
  setGenderPreference: (pref: GenderPreference | null) => void;
  setAgePreference: (min: number | null, max: number | null) => void;
  setNote: (note: string | null) => void;
  setNearbyAlertsEnabled: (enabled: boolean) => void;
  setDailyPushesEnabled: (enabled: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  userId: null,
  isLoading: true,
  isAuthenticated: false,
  dateOfBirth: null,
  instagramHandle: null,
  gender: null,
  age: null,
  genderPreference: null,
  agePreferenceMin: null,
  agePreferenceMax: null,
  note: null,
  nearbyAlertsEnabled: true,
  dailyPushesEnabled: true,

  setSession: (session) =>
    set({
      session,
      userId: session?.user?.id ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setDateOfBirth: (dateOfBirth) => set({ dateOfBirth }),

  setInstagramHandle: (instagramHandle) => set({ instagramHandle }),

  setGender: (gender) => set({ gender }),

  setAge: (age) => set({ age }),

  setGenderPreference: (genderPreference) => set({ genderPreference }),

  setAgePreference: (agePreferenceMin, agePreferenceMax) =>
    set({ agePreferenceMin, agePreferenceMax }),

  setNote: (note) => set({ note }),

  setNearbyAlertsEnabled: (nearbyAlertsEnabled) => set({ nearbyAlertsEnabled }),

  setDailyPushesEnabled: (dailyPushesEnabled) => set({ dailyPushesEnabled }),

  reset: () =>
    set({
      session: null,
      userId: null,
      isLoading: false,
      isAuthenticated: false,
      dateOfBirth: null,
      instagramHandle: null,
      gender: null,
      age: null,
      genderPreference: null,
      agePreferenceMin: null,
      agePreferenceMax: null,
      note: null,
      nearbyAlertsEnabled: true,
      dailyPushesEnabled: true,
    }),
}));
