import { create } from "zustand";
import type { WavePending, Match, WaveResult } from "@/types";

interface EchoState {
  currentToken: string | null;
  tokenExpiresAt: number | null;
  isRotating: boolean;

  pendingWaves: Map<string, WavePending>;
  isWaving: boolean;

  matches: Match[];
  latestUnseenMatch: Match | null;

  setToken: (token: string, expiresAt: number) => void;
  setRotating: (rotating: boolean) => void;
  clearToken: () => void;

  addPendingWave: (targetToken: string) => void;
  removePendingWave: (targetToken: string) => void;
  hasPendingWaveTo: (targetToken: string) => boolean;
  setWaving: (waving: boolean) => void;

  addMatch: (match: Match) => void;
  markMatchSeen: (matchId: string) => void;

  reset: () => void;
}

export const useEchoStore = create<EchoState>((set, get) => ({
  currentToken: null,
  tokenExpiresAt: null,
  isRotating: false,

  pendingWaves: new Map(),
  isWaving: false,

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

  hasPendingWaveTo: (targetToken) => get().pendingWaves.has(targetToken),

  setWaving: (isWaving) => set({ isWaving }),

  addMatch: (match) =>
    set((state) => ({
      matches: [...state.matches, match],
      latestUnseenMatch: match,
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

  reset: () =>
    set({
      currentToken: null,
      tokenExpiresAt: null,
      isRotating: false,
      pendingWaves: new Map(),
      isWaving: false,
      matches: [],
      latestUnseenMatch: null,
    }),
}));
