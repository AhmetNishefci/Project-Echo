# Wave

**Real-world proximity matching through Bluetooth.**

Wave is a mobile app that lets nearby strangers connect. When two people wave at each other, they match and exchange socials (Instagram and/or Snapchat) — no profiles, no swiping, just real-world presence.

Built with React Native 0.81, Expo 54, and Supabase.

---

## How It Works

1. **Discover** — Your phone continuously broadcasts and scans for nearby Wave users via BLE (Bluetooth Low Energy). Each user appears as an anonymous avatar on a radar screen.
2. **Wave** — Tap a nearby person to send a wave. They don't know who waved — only that someone nearby did.
3. **Match** — If both people wave at each other, it's a match. Both users see each other's social handles (Instagram and/or Snapchat).
4. **Connect** — Open their profile directly from the app and start a conversation.

Privacy is core to the design: users are identified only by ephemeral tokens that rotate every 15 minutes. No names, photos, or personal information are ever broadcast over Bluetooth.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React Native App                │
│                                                  │
│  Expo Router (file-based)    Zustand (3 stores)  │
│  NativeWind / Tailwind       Reanimated 4        │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ BLE      │  │ Wave     │  │ Auth          │  │
│  │ Scanner  │  │ Service  │  │ (Google SSO)  │  │
│  │ + Periph │  │ + Realtime│  │               │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
└───────┼──────────────┼────────────────┼──────────┘
        │              │                │
        ▼              ▼                ▼
┌─────────────────────────────────────────────────┐
│                   Supabase                       │
│                                                  │
│  Auth (Google OAuth)     Realtime (broadcast)    │
│  PostgreSQL + PostGIS    Edge Functions (Deno)   │
│  RLS policies            pg_cron + pg_net        │
│  Push via Expo API                               │
└─────────────────────────────────────────────────┘
```

### Client Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 + Expo 54 (New Architecture) |
| Routing | Expo Router 6 (file-based) |
| State | Zustand 5 (`authStore`, `bleStore`, `waveStore`) |
| Styling | NativeWind 4 / Tailwind CSS 3.4 |
| Animations | React Native Reanimated 4 |
| BLE Central | `react-native-ble-plx` 3.5 |
| BLE Peripheral | Custom Expo module (`expo-ble-peripheral`, Swift/CoreBluetooth) |
| Auth | `@react-native-google-signin/google-signin` → Supabase Auth |
| Networking | `@react-native-community/netinfo` for offline detection |

### Backend Stack

| Layer | Technology |
|-------|-----------|
| Database | Supabase PostgreSQL with PostGIS |
| Auth | Supabase Auth (Google ID token exchange) |
| API | 9 Supabase Edge Functions (Deno/TypeScript) |
| Realtime | Supabase Realtime broadcast channels |
| Push Notifications | Expo Push API (via `pg_net` from Edge Functions) |
| Scheduled Jobs | `pg_cron` (cleanup, daily engagement) |
| Access Control | Row Level Security (RLS) + `SECURITY DEFINER` functions |

---

## Project Structure

```
Wave/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (auth gate)
│   ├── index.tsx                 # Entry redirect
│   ├── login.tsx                 # Google Sign In
│   ├── birthday.tsx              # Age verification (DOB input)
│   ├── age-blocked.tsx           # Under-age rejection screen
│   ├── gender.tsx                # Gender selection
│   ├── onboarding.tsx            # Social handles (Instagram/Snapchat)
│   ├── note.tsx                  # Personal note editor
│   ├── nearby-alerts.tsx         # Push notification opt-in
│   └── (main)/                   # Authenticated screens
│       ├── _layout.tsx           # Tab navigator
│       ├── radar.tsx             # Live peer radar (main screen)
│       ├── history.tsx           # Match history (paginated)
│       ├── match.tsx             # Match celebration + confetti
│       └── settings.tsx          # Profile & app settings
├── src/
│   ├── components/               # Reusable UI components
│   ├── hooks/                    # Custom hooks
│   │   ├── useBleLifecycle.ts    # BLE manager lifecycle + foreground reconciliation
│   │   ├── useEphemeralRotation.ts # Token rotation timer
│   │   ├── useMatchListener.ts   # Realtime subscription hook
│   │   ├── useNetworkStatus.ts   # Connectivity monitoring
│   │   ├── useNoteResolver.ts    # Batch note resolution (polling)
│   │   └── useNotifications.ts   # Push notification registration
│   ├── services/
│   │   ├── auth.ts               # Google Sign In + Sign Out
│   │   ├── supabase.ts           # Supabase client init
│   │   ├── profile.ts            # User profile CRUD
│   │   ├── notifications.ts      # Push token registration
│   │   ├── location.ts           # Location tracking
│   │   ├── ble/
│   │   │   ├── constants.ts      # BLE UUIDs, timing constants
│   │   │   ├── scanner.ts        # BLE central (scan + GATT reads)
│   │   │   └── peripheral.ts     # BLE peripheral (advertising)
│   │   └── wave/
│   │       ├── waves.ts          # Send wave, undo wave, remove match + offline queue
│   │       ├── matches.ts        # Fetch matches (cursor-based pagination)
│   │       ├── realtime.ts       # Supabase Realtime subscription + reconnection
│   │       └── session.ts        # Session refresh helper
│   ├── stores/
│   │   ├── authStore.ts          # Auth state (user, session, profile)
│   │   ├── bleStore.ts           # BLE state (nearby peers, scanning status)
│   │   └── waveStore.ts          # Wave state (matches, pending waves, incoming waves)
│   ├── types/
│   │   └── index.ts              # Shared types (Gender, NearbyPeer, Match, etc.)
│   └── utils/
│       ├── logger.ts             # Structured logger (ble, wave, auth channels)
│       ├── haptics.ts            # Haptic feedback
│       ├── sound.ts              # Match chime audio
│       ├── seedPeers.ts          # Dev-only simulated peers
│       ├── deepLink.ts           # Social platform deep-link helpers
│       └── platform.ts           # Platform utilities
├── modules/
│   └── expo-ble-peripheral/      # Custom Expo module (Swift/CoreBluetooth)
│       ├── ios/                   # Native Swift implementation
│       ├── src/                   # TypeScript API
│       └── expo-module.config.json
├── supabase/
│   ├── functions/                # Edge Functions
│   │   ├── assign-ephemeral-id/  # Ephemeral token assignment
│   │   ├── send-wave/            # Wave + match creation (advisory locks)
│   │   ├── remove-match/         # Match deletion + broadcast
│   │   ├── update-location/      # PostGIS location update
│   │   ├── cleanup/              # Expired token/wave cleanup
│   │   ├── daily-engagement/     # Engagement push notifications
│   │   ├── delete-account/       # GDPR account deletion
│   │   ├── auth-instagram/       # Instagram OAuth (future)
│   │   └── auth-callback/        # OAuth callback handler
│   └── migrations/               # SQL migrations (4 files)
│       ├── 00001_initial_schema.sql
│       ├── 00002_tighten_grants.sql
│       ├── 00003_add_age_restriction.sql
│       ├── 00004_dob_age_check.sql
│       ├── 00005_age_preference.sql
│       ├── 00006_revoke_rpc_grants.sql
│       └── 00007_add_snapchat_contact.sql
└── assets/                       # App icons, splash screen, sounds
```

---

## BLE Protocol

Wave uses a custom BLE protocol for anonymous peer discovery.

### Advertising Format

```
Service UUID: E5C00001-B5A3-F393-E0A9-E50E24DCCA9E
Local Name:   "E:{gender_char}{16-hex-token}"
              e.g. "E:Mabc123def456a7b8"
```

- **Gender char**: `M` (male) or `F` (female), prepended to the token
- **Token**: 16-character lowercase hex string, rotated every 15 minutes
- Legacy format `E:{16-hex-token}` (no gender) is supported for backward compatibility

### GATT Fallback (iOS Background)

iOS strips the local name from BLE advertisements when the advertising app is backgrounded. Wave handles this with a GATT characteristic:

```
Characteristic UUID: E5C00002-B5A3-F393-E0A9-E50E24DCCA9E
Value: "{gender_char}{16-hex-token}" (UTF-8, base64-encoded by BLE stack)
```

The scanner connects via GATT, reads the characteristic, and disconnects. Concurrent GATT connections are capped at 4 with a queue (max 20) to avoid exhausting iOS radio resources.

### Timing

| Parameter | Value |
|-----------|-------|
| Token rotation | 15 minutes |
| Early refresh buffer | 3 minutes (with jitter) |
| Scan duration | 10 seconds per cycle |
| Scan pause | 2 seconds between cycles |
| Peer stale timeout | 30 seconds |
| GATT connect timeout | 5 seconds |
| GATT read cooldown | 30 seconds |

---

## Key Features

### Radar Screen
Live view of nearby Wave users. Each peer is shown as a deterministic anonymous avatar (emoji + color derived from their ephemeral token) with distance zone indicators (HERE / CLOSE / NEARBY) based on RSSI thresholds.

### Wave + Match Flow
- Tap a peer to send a wave (calls `send-wave` Edge Function)
- Server uses PostgreSQL advisory locks with `LEAST/GREATEST` user-pair ordering for atomic match creation
- On match: both users receive a Supabase Realtime broadcast event + push notification
- Match celebration screen with confetti animation, haptic feedback, and match chime
- Contact handles (Instagram/Snapchat) fetched via authenticated RPC (not broadcast for security)

### Undo Wave
Waves can be undone within a time window. The undo request goes through the same `send-wave` endpoint with `action: "undo"`.

### Match History
Paginated match list (cursor-based, 50 per page) grouped by date sections (Today / Yesterday / This Week / Older). Pull-to-refresh and infinite scroll.

### Offline Resilience
- **Wave queue**: Failed waves due to network loss are queued in memory and automatically retried when connectivity returns (expires after 15 min matching server-side wave lifetime)
- **GATT queue**: When concurrent GATT reads hit the cap, additional devices are queued (max 20) and processed as slots open
- **Realtime reconnection**: Exponential backoff (3s → 60s) with network awareness — skips reconnect attempts when device is offline
- **Foreground reconciliation**: On every app foreground return, stale pending waves are expired and matches are re-fetched from the server

### Personal Notes
Users can set a short personal note visible to nearby peers. Notes are resolved in batches via polling (every 30s) to minimize server load.

### Age Verification
Date of birth is collected during onboarding and verified server-side. Users under the minimum age are blocked with a dedicated screen.

---

## Developer Setup

### Prerequisites

- Node.js 18+
- Xcode 16+ (for iOS)
- Ruby + CocoaPods (for iOS native modules)
- A Supabase project (Free tier works)
- Google Cloud project with OAuth 2.0 credentials (Web + iOS client IDs)
- EAS CLI (`npm install -g eas-cli`)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Wave

# Install dependencies
npm install

# Copy environment file and fill in your values
cp .env.example .env

# Install iOS native dependencies
cd ios && pod install && cd ..
```

### Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your-google-ios-client-id
```

### Running

```bash
# Start Metro bundler
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on physical device (required for BLE)
npx expo run:ios --device
```

> BLE does not work in the iOS Simulator. You need a physical device to test peer discovery and advertising.

### Supabase Setup

1. Create a new Supabase project
2. Run migrations in order:
   ```bash
   supabase db push
   ```
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy
   ```
4. Set up `pg_cron` jobs for `cleanup` and `daily-engagement` functions (see migration files for schedule details)
5. Enable Realtime for your project in the Supabase dashboard

### Deploying

```bash
# Build for iOS
eas build --platform ios

# Submit to App Store
eas submit --platform ios
```

---

## Design System

Wave uses a custom dark theme via NativeWind/Tailwind:

| Token | Hex | Usage |
|-------|-----|-------|
| `wave-bg` | `#0a0a0a` | App background |
| `wave-surface` | `#1a1a2e` | Cards, modals |
| `wave-primary` | `#6c63ff` | Primary actions, buttons |
| `wave-accent` | `#00d4aa` | Secondary accent |
| `wave-text` | `#e0e0e0` | Primary text |
| `wave-muted` | `#666680` | Secondary text |
| `wave-danger` | `#ff4757` | Destructive actions |
| `wave-wave` | `#4ecdc4` | Wave action color |
| `wave-match` | `#ec4899` | Match celebrations |

---

## Database Schema

Core tables (managed via migrations in `supabase/migrations/`):

- **`profiles`** — User profiles (gender, DOB, Instagram/Snapchat handles, push token, location via PostGIS)
- **`ephemeral_ids`** — Active ephemeral tokens mapped to users (rotated every 15 min)
- **`waves`** — Pending wave records (token → token, expires after 15 min)
- **`matches`** — Confirmed matches (user pairs, created via advisory locks)
- **`notes`** — Personal notes attached to ephemeral tokens

All tables are protected by Row Level Security. Sensitive operations (match creation, handle retrieval) use `SECURITY DEFINER` functions to enforce access control at the database level.

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `assign-ephemeral-id` | Assigns a new ephemeral token to the authenticated user |
| `send-wave` | Sends a wave or processes an undo; creates match if mutual wave exists |
| `remove-match` | Deletes a match and broadcasts removal to the other user |
| `update-location` | Updates user's PostGIS location for nearby alerts |
| `cleanup` | Removes expired tokens and waves (called by `pg_cron`) |
| `daily-engagement` | Sends re-engagement push notifications (called by `pg_cron`) |
| `delete-account` | Full GDPR-compliant account deletion |
| `auth-instagram` | Instagram OAuth flow (future) |
| `auth-callback` | OAuth callback handler |

---

## Roadmap

### Near-Term

- [ ] **Test Suite** — Unit tests for BLE protocol parsing, store logic, and Edge Functions. Integration tests for wave/match flow.
- [ ] **Sentry Integration** — Crash reporting and performance monitoring. Replace `logger` calls with Sentry breadcrumbs for production diagnostics.
- [ ] **Remove `seedPeers.ts`** — Development-only simulated peers. Strip from production bundle or gate behind `__DEV__`.
- [ ] **Privacy Policy & Terms of Service** — Static website (required for App Store submission and GDPR compliance).

### Mid-Term

- [ ] **Instagram OAuth** — Replace Google Sign In with Instagram as the primary auth method. Users authenticate directly with their Instagram account, eliminating the manual handle entry step.
- [ ] **Android BLE Peripheral** — Implement Android-side BLE peripheral advertising (currently iOS-only via `expo-ble-peripheral`). The central/scanner side already works on Android.
### Long-Term

- [ ] **Supabase Pro Upgrade** — Required for scaling beyond 200 concurrent Realtime connections and 2 concurrent Edge Functions. Enables connection pooling (PgBouncer) and higher invocation limits.
- [ ] **Monetization** — Premium features (e.g., extended wave range, see who waved first, priority in radar). Subscription or one-time purchase model.
- [ ] **Horizontal Scaling** — Partition ephemeral IDs by region, add Redis caching layer for hot paths, implement edge deployment for Edge Functions.
- [ ] **Location-Based Features** — Venue/event mode, heatmaps of Wave activity, location-gated waves.

---

## Current Limitations

- **iOS only** for BLE peripheral advertising (scanner works on both platforms)
- **Supabase Free tier** limits: 200 concurrent Realtime connections, 2 concurrent Edge Functions, 500K function invocations/month
- **No test suite** — All testing is manual
- **No crash reporting** — Errors are logged to console only
- **BLE range** — Effective range is ~30 meters (hardware dependent), with best results under 10 meters

---

## License

Private — All rights reserved.
