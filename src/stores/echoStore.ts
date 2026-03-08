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
  /** Map ephemeral token → Instagram handle for matched peers (display in detail modal) */
  matchedHandles: Map<string, string>;
  /** Map userId → ephemeralToken for pending waves (bridges realtime match events to radar) */
  pendingWaveUserMap: Map<string, string>;
  addMatchedToken: (token: string, instagramHandle?: string) => void;
  clearMatchedTokens: () => void;
  setPendingWaveUser: (userId: string, ephemeralToken: string) => void;
  removePendingWaveByToken: (ephemeralToken: string) => void;

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
      matchedHandles: new Map<string, string>(),
      pendingWaveUserMap: new Map<string, string>(),

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

      addMatchedToken: (token, instagramHandle) =>
        set((state) => {
          const nextTokens = new Set(state.matchedTokens);
          nextTokens.add(token);
          const nextHandles = new Map(state.matchedHandles);
          if (instagramHandle) nextHandles.set(token, instagramHandle);
          return { matchedTokens: nextTokens, matchedHandles: nextHandles };
        }),

      clearMatchedTokens: () => set({ matchedTokens: new Set(), matchedHandles: new Map() }),

      setPendingWaveUser: (userId, ephemeralToken) =>
        set((state) => {
          const next = new Map(state.pendingWaveUserMap);
          next.set(userId, ephemeralToken);
          return { pendingWaveUserMap: next };
        }),

      removePendingWaveByToken: (ephemeralToken) =>
        set((state) => {
          const next = new Map(state.pendingWaveUserMap);
          for (const [userId, token] of next) {
            if (token === ephemeralToken) {
              next.delete(userId);
              break;
            }
          }
          return { pendingWaveUserMap: next };
        }),

      addMatch: (match) =>
        set((state) => {
          // Prevent duplicate matches (C9 fix)
          const existing = state.matches.find((m) => m.matchId === match.matchId);
          if (existing) {
            // Don't re-trigger match screen for already-seen or already-displayed matches
            return {};
          }

          // Bridge: if we have a pending wave to this user, mark their token as matched
          const ephemeralToken = state.pendingWaveUserMap.get(match.matchedUserId);
          let nextTokens = state.matchedTokens;
          let nextHandles = state.matchedHandles;
          let nextUserMap = state.pendingWaveUserMap;
          if (ephemeralToken) {
            nextTokens = new Set(state.matchedTokens);
            nextTokens.add(ephemeralToken);
            nextHandles = new Map(state.matchedHandles);
            if (match.instagramHandle) nextHandles.set(ephemeralToken, match.instagramHandle);
            nextUserMap = new Map(state.pendingWaveUserMap);
            nextUserMap.delete(match.matchedUserId);
          }

          return {
            matches: [...state.matches, match],
            latestUnseenMatch: match,
            matchedTokens: nextTokens,
            matchedHandles: nextHandles,
            pendingWaveUserMap: nextUserMap,
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
          matchedHandles: new Map(),
          pendingWaveUserMap: new Map(),
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
