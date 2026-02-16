import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WavePending, Match } from "@/types";

interface EchoState {
  currentToken: string | null;
  tokenExpiresAt: number | null;
  isRotating: boolean;

  pendingWaves: Map<string, WavePending>;
  isWaving: boolean;

  /** Number of anonymous incoming waves from nearby people */
  incomingWaveCount: number;

  matches: Match[];
  latestUnseenMatch: Match | null;

  setToken: (token: string, expiresAt: number) => void;
  setRotating: (rotating: boolean) => void;
  clearToken: () => void;

  addPendingWave: (targetToken: string) => void;
  removePendingWave: (targetToken: string) => void;
  clearAllPendingWaves: () => void;
  hasPendingWaveTo: (targetToken: string) => boolean;
  setWaving: (waving: boolean) => void;

  incrementIncomingWaves: () => void;
  decrementIncomingWaves: () => void;
  resetIncomingWaves: () => void;

  addMatch: (match: Match) => void;
  markMatchSeen: (matchId: string) => void;

  reset: () => void;
}

export const useEchoStore = create<EchoState>()(
  persist(
    (set, get) => ({
      currentToken: null,
      tokenExpiresAt: null,
      isRotating: false,

      pendingWaves: new Map(),
      isWaving: false,

      incomingWaveCount: 0,

      matches: [],
      latestUnseenMatch: null,

      setToken: (token, expiresAt) =>
        set({ currentToken: token, tokenExpiresAt: expiresAt }),

      setRotating: (isRotating) => set({ isRotating }),

      clearToken: () => set({ currentToken: null, tokenExpiresAt: null }),

      addPendingWave: (targetToken) =>
        set((state) => {
          const next = new Map(state.pendingWaves);
          next.set(targetToken, { targetToken, sentAt: Date.now() });
          return { pendingWaves: next };
        }),

      removePendingWave: (targetToken) =>
        set((state) => {
          const next = new Map(state.pendingWaves);
          next.delete(targetToken);
          return { pendingWaves: next };
        }),

      clearAllPendingWaves: () => set({ pendingWaves: new Map() }),

      hasPendingWaveTo: (targetToken) => get().pendingWaves.has(targetToken),

      setWaving: (isWaving) => set({ isWaving }),

      incrementIncomingWaves: () =>
        set((state) => ({ incomingWaveCount: state.incomingWaveCount + 1 })),
      decrementIncomingWaves: () =>
        set((state) => ({ incomingWaveCount: Math.max(0, state.incomingWaveCount - 1) })),
      resetIncomingWaves: () => set({ incomingWaveCount: 0 }),

      addMatch: (match) =>
        set((state) => {
          // Prevent duplicate matches
          if (state.matches.some((m) => m.matchId === match.matchId)) {
            return { latestUnseenMatch: match.seen ? state.latestUnseenMatch : match };
          }
          return {
            matches: [...state.matches, match],
            latestUnseenMatch: match,
          };
        }),

      markMatchSeen: (matchId) =>
        set((state) => ({
          matches: state.matches.map((m) =>
            m.matchId === matchId ? { ...m, seen: true } : m,
          ),
          latestUnseenMatch:
            state.latestUnseenMatch?.matchId === matchId
              ? null
              : state.latestUnseenMatch,
        })),

      reset: () =>
        set({
          currentToken: null,
          tokenExpiresAt: null,
          isRotating: false,
          pendingWaves: new Map(),
          isWaving: false,
          incomingWaveCount: 0,
          matches: [],
          latestUnseenMatch: null,
        }),
    }),
    {
      name: "echo-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist matches — everything else is ephemeral session state
      partialize: (state) => ({
        matches: state.matches,
      }),
    },
  ),
);
