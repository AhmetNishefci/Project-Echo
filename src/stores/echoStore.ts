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

  /** Ephemeral tokens of people who waved at us (anonymous, for "Wave Back" UI) */
  incomingWaveTokens: string[];

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

  addIncomingWaveToken: (token: string) => void;
  removeIncomingWaveToken: (token: string) => void;
  resetIncomingWaveTokens: () => void;

  /** Ephemeral tokens that returned already_matched this session */
  matchedTokens: Set<string>;
  addMatchedToken: (token: string) => void;
  clearMatchedTokens: () => void;

  addMatch: (match: Match) => void;
  removeMatch: (matchId: string) => void;
  markMatchSeen: (matchId: string) => void;
  clearMatches: () => void;

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

      incomingWaveTokens: [],

      matches: [],
      latestUnseenMatch: null,

      matchedTokens: new Set<string>(),

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

      addIncomingWaveToken: (token) =>
        set((state) => ({
          incomingWaveTokens: state.incomingWaveTokens.includes(token)
            ? state.incomingWaveTokens
            : [...state.incomingWaveTokens, token],
        })),
      removeIncomingWaveToken: (token) =>
        set((state) => ({
          incomingWaveTokens: state.incomingWaveTokens.filter((t) => t !== token),
        })),
      resetIncomingWaveTokens: () => set({ incomingWaveTokens: [] }),

      addMatchedToken: (token) =>
        set((state) => {
          const next = new Set(state.matchedTokens);
          next.add(token);
          return { matchedTokens: next };
        }),

      clearMatchedTokens: () => set({ matchedTokens: new Set() }),

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

      removeMatch: (matchId) =>
        set((state) => ({
          matches: state.matches.filter((m) => m.matchId !== matchId),
          latestUnseenMatch:
            state.latestUnseenMatch?.matchId === matchId
              ? null
              : state.latestUnseenMatch,
        })),

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

      clearMatches: () =>
        set({ matches: [], latestUnseenMatch: null }),

      reset: () =>
        set({
          currentToken: null,
          tokenExpiresAt: null,
          isRotating: false,
          pendingWaves: new Map(),
          isWaving: false,
          incomingWaveTokens: [],
          matches: [],
          latestUnseenMatch: null,
          matchedTokens: new Set(),
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
