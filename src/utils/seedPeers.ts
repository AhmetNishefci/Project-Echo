import { useBleStore } from "@/stores/bleStore";
import { useWaveStore } from "@/stores/waveStore";
import type { NearbyPeer } from "@/types";

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

const NAMES = [
  "Sarah, blonde hair, blue jacket",
  "Alex @ the bar with the red hoodie!",
  null,
  "This note is exactly 40 characters long!",
  "Mia",
  "Looking for my friend lol",
  "Just vibing",
  null,
  "Coffee lover",
  "Emma, waiting outside",
  null,
  "Lost and confused haha",
  "Jake, tall guy by the door",
  "Chill vibes only",
  null,
  "Waiting for the bus",
  "Olivia",
  "Here for the concert",
  null,
  "Anyone wanna grab food?",
  "Marco",
  null,
  "Studying at the library",
  "New in town!",
  "Lily, green coat",
  null,
  "Just passing through",
  "Dan, brown hat",
  null,
  "Looking for coffee recs",
  "Priya",
  "With my dog",
  null,
  "Checking this app out",
  "Tom",
  null,
  "On a walk",
  "Soph, near the fountain",
  null,
  "Anyone else bored?",
  "Leo",
  "At the park",
  null,
  "First time here",
  "Noor",
  null,
  "Rainy day vibes",
  "Chris, white sneakers",
  null,
  "Exploring the city",
  "Ava",
  null,
  "Working remotely from this cafe",
  "Ben, sitting outside",
  null,
  "Just moved here",
  "Zara",
  null,
  "Weekend mode",
  "Kai, headphones on",
  null,
  "Looking for study buddies",
  "Maya",
  null,
  "By the window seat",
  "Ethan",
  null,
  "Walking around downtown",
  "Riya, red scarf",
  null,
];

function generatePeers(): NearbyPeer[] {
  const now = Date.now();
  const genders: ("male" | "female" | null)[] = ["female", "male", "female", "male", "female", "male", null, "female", "male", "female", "male", null];
  const ages: (number | null)[] = [22, 25, 19, 28, 21, 33, null, 20, 27, 24, 31, 18, 23, 26, 35, 29, null, 22, 40, 19];
  const peers: NearbyPeer[] = [];

  for (let i = 0; i < NAMES.length; i++) {
    const idx = i + 1;
    const token = `a1b2c3d4e5f6${String(idx).padStart(4, "0")}`;

    // Distribute across zones: ~15 HERE, ~25 CLOSE, ~30 NEARBY
    let rssi: number;
    if (i < 15) {
      rssi = -35 - (i % 20); // HERE: -35 to -54
    } else if (i < 40) {
      rssi = -56 - (i % 19); // CLOSE: -56 to -74
    } else {
      rssi = -76 - (i % 14); // NEARBY: -76 to -89
    }

    peers.push({
      deviceBleId: `fake-${String(idx).padStart(3, "0")}`,
      ephemeralToken: token,
      rssi,
      lastSeen: now,
      discoveredAt: i < 5 ? now : now - (i * 30_000),
      gender: genders[i % genders.length],
      age: ages[i % ages.length],
      note: NAMES[i],
    });
  }

  return peers;
}

/**
 * DEV ONLY: Seed fake peers into bleStore for UI testing.
 * Call from radar or a debug button. Remove before release.
 */
export function seedFakePeers(): void {
  const store = useBleStore.getState();
  const waveStore = useWaveStore.getState();

  const fakePeers = generatePeers();

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

  // Simulate some interactions across different zones:
  waveStore.addIncomingWaveToken(fakePeers[0].ephemeralToken);  // HERE zone
  waveStore.addIncomingWaveToken(fakePeers[3].ephemeralToken);  // HERE zone
  waveStore.addIncomingWaveToken(fakePeers[6].ephemeralToken);  // HERE zone
  waveStore.addIncomingWaveToken(fakePeers[18].ephemeralToken); // CLOSE zone
  waveStore.addIncomingWaveToken(fakePeers[25].ephemeralToken); // CLOSE zone
  waveStore.addPendingWave(fakePeers[4].ephemeralToken);
  waveStore.addMatchedToken(fakePeers[8].ephemeralToken, { instagram: "emma.w" });
  waveStore.addMatchedToken(fakePeers[12].ephemeralToken, { instagram: "jake_adventures", snapchat: "jake_snap" });
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
  useWaveStore.getState().clearAllPendingWaves();
  useWaveStore.getState().resetIncomingWaveTokens();
  useWaveStore.getState().clearMatchedTokens();
}
