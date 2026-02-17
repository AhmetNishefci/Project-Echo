import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  instagramHandle: string | null;

  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setInstagramHandle: (handle: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  userId: null,
  isLoading: true,
  isAuthenticated: false,
  instagramHandle: null,

  setSession: (session) =>
    set({
      session,
      userId: session?.user?.id ?? null,
      isAuthenticated: !!session,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setInstagramHandle: (instagramHandle) => set({ instagramHandle }),

  reset: () =>
    set({
      session: null,
      userId: null,
      isLoading: false,
      isAuthenticated: false,
      instagramHandle: null,
    }),
}));
