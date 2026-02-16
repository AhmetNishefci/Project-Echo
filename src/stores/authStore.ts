import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  userId: null,
  isLoading: true,
  isAuthenticated: false,

  setSession: (session) =>
    set({
      session,
      userId: session?.user?.id ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () =>
    set({
      session: null,
      userId: null,
      isLoading: false,
      isAuthenticated: false,
    }),
}));
