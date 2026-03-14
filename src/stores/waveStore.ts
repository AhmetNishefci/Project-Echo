import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WavePending, Match, ContactHandles } from "@/types";

interface WaveState {
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
  /** Map ephemeral token → contact handles for matched peers (display in detail modal) */
  matchedHandles: Map<string, ContactHandles>;
  /** Map userId → ephemeralToken for pending waves (bridges realtime match events to radar) */
  pendingWaveUserMap: Map<string, string>;
  addMatchedToken: (token: string, handles?: ContactHandles) => void;
  clearMatchedTokens: () => void;
  setPendingWaveUser: (userId: string, ephemeralToken: string) => void;
  removePendingWaveByToken: (ephemeralToken: string) => void;

  addMatch: (match: Match) => void;
  removeMatch: (matchId: string) => void;
  updateMatchHandle: (matchId: string, instagramHandle: string) => void;
  updateMatchHandles: (matchId: string, handles: { instagramHandle?: string; snapchatHandle?: string }) => void;
  markMatchSeen: (matchId: string) => void;
  clearMatches: () => void;

  reset: () => void;
}

export const useWaveStore = create<WaveState>()(
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
      matchedHandles: new Map<string, ContactHandles>(),
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

      addMatchedToken: (token, handles) =>
        set((state) => {
          const nextTokens = new Set(state.matchedTokens);
          nextTokens.add(token);
          const nextHandles = new Map(state.matchedHandles);
          if (handles && (handles.instagram || handles.snapchat)) {
            const existing = nextHandles.get(token);
            nextHandles.set(token, { ...existing, ...handles });
          }
          return { matchedTokens: nextTokens, matchedHandles: nextHandles };
        }),

      clearMatchedTokens: () => set({ matchedTokens: new Set(), matchedHandles: new Map<string, ContactHandles>() }),

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
            // Merge handles if the new call has data the existing doesn't (L1 fix).
            // This handles the race where Realtime delivers the match first (no handles),
            // then the HTTP response arrives with handles.
            const needsIgUpdate = match.instagramHandle && !existing.instagramHandle;
            const needsScUpdate = match.snapchatHandle && !existing.snapchatHandle;
            if (needsIgUpdate || needsScUpdate) {
              const updates = {
                ...(needsIgUpdate ? { instagramHandle: match.instagramHandle } : {}),
                ...(needsScUpdate ? { snapchatHandle: match.snapchatHandle } : {}),
              };
              return {
                matches: state.matches.map((m) =>
                  m.matchId === match.matchId ? { ...m, ...updates } : m,
                ),
                latestUnseenMatch:
                  state.latestUnseenMatch?.matchId === match.matchId
                    ? { ...state.latestUnseenMatch, ...updates }
                    : state.latestUnseenMatch,
              };
            }
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
            const handles: ContactHandles = {};
            if (match.instagramHandle) handles.instagram = match.instagramHandle;
            if (match.snapchatHandle) handles.snapchat = match.snapchatHandle;
            if (handles.instagram || handles.snapchat) {
              const existing = nextHandles.get(ephemeralToken);
              nextHandles.set(ephemeralToken, { ...existing, ...handles });
            }
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

      updateMatchHandle: (matchId, instagramHandle) =>
        set((state) => ({
          matches: state.matches.map((m) =>
            m.matchId === matchId ? { ...m, instagramHandle } : m,
          ),
          latestUnseenMatch:
            state.latestUnseenMatch?.matchId === matchId
              ? { ...state.latestUnseenMatch, instagramHandle }
              : state.latestUnseenMatch,
        })),

      updateMatchHandles: (matchId: string, handles: { instagramHandle?: string; snapchatHandle?: string }) =>
        set((state) => ({
          matches: state.matches.map((m) =>
            m.matchId === matchId
              ? {
                  ...m,
                  ...(handles.instagramHandle ? { instagramHandle: handles.instagramHandle } : {}),
                  ...(handles.snapchatHandle ? { snapchatHandle: handles.snapchatHandle } : {}),
                }
              : m,
          ),
          latestUnseenMatch:
            state.latestUnseenMatch?.matchId === matchId
              ? {
                  ...state.latestUnseenMatch,
                  ...(handles.instagramHandle ? { instagramHandle: handles.instagramHandle } : {}),
                  ...(handles.snapchatHandle ? { snapchatHandle: handles.snapchatHandle } : {}),
                }
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
          matchedHandles: new Map<string, ContactHandles>(),
          pendingWaveUserMap: new Map(),
        }),
    }),
    {
      name: "wave-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist matches — everything else is ephemeral session state
      partialize: (state) => ({
        matches: state.matches,
      }),
    },
  ),
);
