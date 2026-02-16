import { create } from "zustand";
import type { NearbyPeer, BlePermissionStatus, BleAdapterState } from "@/types";
import { PEER_STALE_TIMEOUT_MS } from "@/services/ble/constants";

interface BleState {
  adapterState: BleAdapterState;
  isScanning: boolean;
  isAdvertising: boolean;
  permissionStatus: BlePermissionStatus;
  nearbyPeers: Map<string, NearbyPeer>;
  error: string | null;

  setAdapterState: (state: BleAdapterState) => void;
  setScanning: (scanning: boolean) => void;
  setAdvertising: (advertising: boolean) => void;
  setPermissionStatus: (status: BlePermissionStatus) => void;
  setError: (error: string | null) => void;
  upsertPeer: (peer: NearbyPeer) => void;
  removePeer: (token: string) => void;
  pruneStale: () => void;
  clearPeers: () => void;
  reset: () => void;
}

export const useBleStore = create<BleState>((set, get) => ({
  adapterState: "Unknown",
  isScanning: false,
  isAdvertising: false,
  permissionStatus: "unknown",
  nearbyPeers: new Map(),
  error: null,

  setAdapterState: (adapterState) => set({ adapterState }),
  setScanning: (isScanning) => set({ isScanning }),
  setAdvertising: (isAdvertising) => set({ isAdvertising }),
  setPermissionStatus: (permissionStatus) => set({ permissionStatus }),
  setError: (error) => set({ error }),

  upsertPeer: (peer) =>
    set((state) => {
      const next = new Map(state.nearbyPeers);
      next.set(peer.ephemeralToken, peer);
      return { nearbyPeers: next };
    }),

  removePeer: (token) =>
    set((state) => {
      const next = new Map(state.nearbyPeers);
      next.delete(token);
      return { nearbyPeers: next };
    }),

  pruneStale: () =>
    set((state) => {
      const now = Date.now();
      const next = new Map(state.nearbyPeers);
      let changed = false;
      for (const [token, peer] of next) {
        if (now - peer.lastSeen > PEER_STALE_TIMEOUT_MS) {
          next.delete(token);
          changed = true;
        }
      }
      return changed ? { nearbyPeers: next } : {};
    }),

  clearPeers: () => set({ nearbyPeers: new Map() }),

  reset: () =>
    set({
      adapterState: "Unknown",
      isScanning: false,
      isAdvertising: false,
      permissionStatus: "unknown",
      nearbyPeers: new Map(),
      error: null,
    }),
}));
