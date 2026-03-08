import { useBleStore } from "@/stores/bleStore";
import { useEchoStore } from "@/stores/echoStore";
import type { NearbyPeer } from "@/types";

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * DEV ONLY: Seed fake peers into bleStore for UI testing.
 * Call from radar or a debug button. Remove before release.
 */
export function seedFakePeers(): void {
  const store = useBleStore.getState();
  const echoStore = useEchoStore.getState();
  const now = Date.now();

  const fakePeers: NearbyPeer[] = [
    // HERE zone (rssi >= -55)
    {
      deviceBleId: "fake-001",
      ephemeralToken: "a1b2c3d4e5f60001",
      rssi: -35,
      lastSeen: now,
      discoveredAt: now - 60_000,
      gender: "female",
      note: "Sarah, blonde hair, blue jacket",
    },
    {
      deviceBleId: "fake-002",
      ephemeralToken: "a1b2c3d4e5f60002",
      rssi: -42,
      lastSeen: now,
      discoveredAt: now - 30_000,
      gender: "male",
      note: "Alex @ the bar with the red hoodie!",
    },
    {
      deviceBleId: "fake-003",
      ephemeralToken: "a1b2c3d4e5f60003",
      rssi: -50,
      lastSeen: now - 5_000,
      discoveredAt: now - 120_000,
      gender: "female",
      note: null, // No note — shows "Someone"
    },
    {
      deviceBleId: "fake-004",
      ephemeralToken: "a1b2c3d4e5f60004",
      rssi: -48,
      lastSeen: now,
      discoveredAt: now - 10_000,
      gender: "male",
      note: "This note is exactly 40 characters long!", // Max length
    },

    // CLOSE zone (rssi -55 to -75)
    {
      deviceBleId: "fake-005",
      ephemeralToken: "a1b2c3d4e5f60005",
      rssi: -58,
      lastSeen: now,
      discoveredAt: now - 90_000,
      gender: "female",
      note: "Mia",
    },
    {
      deviceBleId: "fake-006",
      ephemeralToken: "a1b2c3d4e5f60006",
      rssi: -63,
      lastSeen: now - 8_000,
      discoveredAt: now - 200_000,
      gender: "male",
      note: "Looking for my friend lol",
    },
    {
      deviceBleId: "fake-007",
      ephemeralToken: "a1b2c3d4e5f60007",
      rssi: -70,
      lastSeen: now,
      discoveredAt: now - 45_000,
      gender: null, // Unknown gender
      note: "Just vibing",
    },
    {
      deviceBleId: "fake-008",
      ephemeralToken: "a1b2c3d4e5f60008",
      rssi: -68,
      lastSeen: now - 3_000,
      discoveredAt: now - 15_000,
      gender: "female",
      note: null,
    },
    {
      deviceBleId: "fake-009",
      ephemeralToken: "a1b2c3d4e5f60009",
      rssi: -72,
      lastSeen: now,
      discoveredAt: now - 300_000,
      gender: "male",
      note: "Coffee lover",
    },

    // NEARBY zone (rssi < -75)
    {
      deviceBleId: "fake-010",
      ephemeralToken: "a1b2c3d4e5f60010",
      rssi: -78,
      lastSeen: now - 15_000,
      discoveredAt: now - 400_000,
      gender: "female",
      note: "Emma, waiting outside",
    },
    {
      deviceBleId: "fake-011",
      ephemeralToken: "a1b2c3d4e5f60011",
      rssi: -82,
      lastSeen: now,
      discoveredAt: now - 60_000,
      gender: "male",
      note: null,
    },
    {
      deviceBleId: "fake-012",
      ephemeralToken: "a1b2c3d4e5f60012",
      rssi: -88,
      lastSeen: now - 20_000,
      discoveredAt: now - 500_000,
      gender: null,
      note: "Lost and confused haha",
    },
  ];

  // Insert all fake peers
  for (const peer of fakePeers) {
    store.upsertPeer(peer);
  }

  // Keep peers alive by refreshing lastSeen every 10s (prevents pruning)
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  keepAliveInterval = setInterval(() => {
    const currentPeers = useBleStore.getState().nearbyPeers;
    const refreshed = Date.now();
    for (const peer of fakePeers) {
      if (currentPeers.has(peer.ephemeralToken)) {
        store.upsertPeer({ ...peer, lastSeen: refreshed });
      }
    }
  }, 10_000);

  // Simulate some interactions:
  // - Peer 001 waved at us (incoming wave)
  echoStore.addIncomingWaveToken("a1b2c3d4e5f60001");
  // - Peer 007 also waved at us
  echoStore.addIncomingWaveToken("a1b2c3d4e5f60007");
  // - We already waved at peer 005 (pending wave)
  echoStore.addPendingWave("a1b2c3d4e5f60005");
  // - We already matched with peer 009
  echoStore.addMatchedToken("a1b2c3d4e5f60009");
}

/**
 * DEV ONLY: Clear all fake peers.
 */
export function clearFakePeers(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  useBleStore.getState().clearPeers();
  useEchoStore.getState().clearAllPendingWaves();
  useEchoStore.getState().resetIncomingWaveTokens();
  useEchoStore.getState().clearMatchedTokens();
}
