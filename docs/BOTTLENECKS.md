# Rantchit — Bottlenecks, Risks & Fixes

This document tracks the known bottlenecks and pitfalls in the **voice chat**
and **arcade (games, including Flash)** features, the evidence for each, the
mitigation applied in the current pass, and what remains.

Scope notes:
- The server is a zero-knowledge relay. Everything below is about *transport,
  scale, and browser/IAB concerns* — never about inspecting payloads.
- Severity: **S1** = breaks the feature in common conditions, **S2** = degraded
  or fragile, **S3** = cosmetic / future-proofing.
- "Fixed" means code changed in this pass; "Documented" means only tracked here.

---

## 1. Voice chat

### 1.1 Mesh topology is O(N²) — S1 (scale)
Every participant opens a direct `RTCPeerConnection` to every other participant
(`src/frontend/src/lib/webrtc.ts`, `VoiceCall`). A room of `N` peers therefore
needs `N·(N-1)` directed signal handshakes and every peer uploads its audio
`N-1` times.

| Peers | Peer connections (total) | Connections per peer | Upload streams per peer |
|-------|--------------------------|----------------------|-------------------------|
| 2     | 2                        | 1                    | 1                       |
| 4     | 12                       | 3                    | 3                       |
| 8     | 56                       | 7                    | 7                       |

Evidence: `src/backend/tests/test_relay_scale.py::TestMultiUser::test_full_mesh_signal_volume`
asserts the `N·(N-1) == 56` signal volume for a full 8-peer room.

**Impact:** uplink saturation and CPU/encode cost grow quadratically; mobile
clients choke first. Rooms are capped at 8 (`ROOM_MAX_PARTICIPANTS_LIMIT`,
`src/backend/app/config.py`).

**Mitigation (Documented):** for more than ~4 speakers, move to an SFU
(LiveKit / mediasoup / Janus) so each client has one upload and one download.
The signalling relay already carries opaque frames, so the client transport is
the only change required.

### 1.2 STUN-only ICE — no TURN — S1 (connectivity)
`ICE_SERVERS` previously hard-coded a single public Google STUN server. STUN
alone cannot traverse symmetric NAT or restrictive corporate/mobile networks;
~8–20% of real-world pairs fail to connect.

**Fixed (partial):**
- ICE configuration is now loadable: `loadIceServers()` reads
  `window.__RANTCHIT_ICE__` or `localStorage["rantchit_ice"]` and falls back to
  public STUN (`src/frontend/src/lib/webrtc.ts`).
- `hasTurnConfigured()` detects whether a `turn:`/`turns:` URL is present and
  the Voice panel warns when only STUN is configured.

**Remaining (Documented):** deploy a TURN server (coturn) and inject the config,
e.g.:

```html
<script>
  window.__RANTCHIT_ICE__ = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:turn.example.com:3478", username: "user", credential: "pass" }
  ];
</script>
```

TURN credentials should be **time-limited** (coturn REST API / `turn_credentials`).
TURN relays encrypted media only — the server still cannot decrypt DTLS-SRTP.

### 1.3 Signalling rate limit is per-IP and shared behind NAT — S1
Relay frames are rate-limited by a hash of the **client IP**:

- `src/backend/app/endpoints/ws.py:136` — `is_rate_limited()` keys on
  `ratelimit:ip:{ip_hash}:{kind}`.
- `src/backend/app/config.py:33` — `RATE_LIMIT_SIGNALS_PER_MINUTE = 240`.

Two problems:
1. Several peers behind the same NAT (home/office Wi-Fi) **share one 240/min
   budget**. A busy multi-peer ICE negotiation can exhaust it and the relay
   returns `"signal rate limit exceeded."`, silently killing the call.
2. Behind a reverse proxy the IP is wrong unless `TRUST_PROXY_HEADERS=true`,
   so *everyone* can collapse into one bucket.

Evidence: `test_relay_scale.py::TestRelayRateLimit::test_per_ip_signal_budget_is_finite`.

**Mitigation (Documented):** key the signal bucket per **connection/peer id**
(or per room), not per IP, and raise the window for `signal` specifically. IP
buckets are still appropriate for `create`/`join`.

### 1.4 `Permissions-Policy` disabled the microphone — S1 (fixed)
`src/backend/app/main.py` was sending `Permissions-Policy: camera=(),
microphone=(), geolocation=()` on every response. Applied to a document, that
header **turns the microphone off**, so voice only worked because nginx serves
the SPA *without* the header. Fragile and inconsistent across the two front
doors (nginx vs Caddy).

**Fixed:** `PERMISSIONS_POLICY` is now `camera=(), microphone=(self),
geolocation=()` (`src/backend/app/config.py:44`, used at
`src/backend/app/main.py:51`) and the same value is set by `nginx.conf` and the
Caddyfiles. `microphone=(self)` grants the SPA access while keeping it off for
any framed third-party content.

### 1.5 The SPA had no Content-Security-Policy — S2 (fixed)
`docs/adr/005-strict-csp.md` is an empty stub and neither `nginx.conf` nor the
Caddyfiles emitted a CSP, so the shipped app ran with no CSP at all while the
backend advertised one on JSON only.

**Fixed:** a strict CSP is now emitted for the SPA (see §2.1), including
`worker-src 'self' blob:` and `'wasm-unsafe-eval'` needed by Ruffle.

### 1.6 AudioContext starts suspended (autoplay policy) — S2 (fixed)
`monitorStream()` created an `AudioContext` that may begin in the `suspended`
state, so the speaking indicator never lit. **Fixed:** the context is now
resumed if suspended (`src/frontend/src/lib/webrtc.ts`, `monitorStream`).

### 1.7 Media leaks on peer leave — S2 (fixed)
On `participant_left`, the level monitor and the `remoteStreams`/`speaking`
entries were not removed, leaking an `AudioContext` per departed peer and
leaving ghost tiles. **Fixed:** `cleanupPeerMedia()` drops the monitor, stream,
and speaking flag for the peer (`src/frontend/src/pages/RoomScreen.tsx`).

### 1.8 Voice was not gated on key readiness — S2 (fixed)
Signalling frames are E2E-encrypted, so starting voice before the session key
existed produced silent failures. **Fixed:** `startVoice()` refuses until the
key is confirmed, and `VoicePanel` disables the button with a reason
(`disabled` / `disabledReason` props).

### 1.9 No ICE-restart / reconnection — S3 (documented)
`onconnectionstatechange` now surfaces `failed` to the UI (with a TURN hint),
but there is no automatic ICE restart or peer renegotiation. **Remaining:** add
`restartIce()` on transient failures and retry with backoff.

---

## 2. Arcade (games, including Flash)

### 2.1 Strict CSP blocks external games and scripts — S1 (fixed for the SPA)
The planned CSP (ADR-005) is `default-src 'self'`, `object-src 'none'`, with no
`frame-src`, which forbids framing internet games and loading CDN scripts.

**Fixed:** the SPA CSP (nginx + Caddy + `CONTENT_SECURITY_POLICY`) now includes:

```
script-src 'self' 'wasm-unsafe-eval';   # Ruffle WASM, still no remote JS
worker-src 'self' blob:;                # Ruffle worker
frame-src 'self' https:;                # opt-in external game frames
```

Narrow `frame-src` to a host allow-list if you do not want any external frames.
Note the app itself never loads remote scripts — external games run only inside
a cross-origin sandboxed iframe, which has its own CSP.

### 2.2 Hotlinking internet games leaks user IPs — S1 (privacy)
Framing an arbitrary third-party game exposes each user's IP and lets the game
host set its own cookies, which is at odds with the app's privacy posture.
There is also no guarantee a "retro game URL" still resolves or is safe.

**Fixed (mitigation):**
- External games are **opt-in**: the user pastes a URL and confirms an explicit
  privacy warning (`src/frontend/src/components/games/ExternalGameFrame.tsx`).
- URLs are validated: https only (or a same-origin `/path`), and the host must
  be in `EXTERNAL_GAME_HOSTS` (`src/frontend/src/lib/constants.ts`).
- The iframe uses `sandbox="allow-scripts allow-pointer-lock"` **without**
  `allow-same-origin`, so it runs in an opaque origin, plus
  `referrerpolicy="no-referrer"`.

**Remaining (Documented):** prefer self-hosting/curating games over hotlinking.

### 2.3 Flash is end-of-life — S1 (fixed for delivery)
No browser runs `.swf` natively anymore, so "retro Flash" needs a WASM
emulator.

**Fixed:** `RuffleFlash` (`src/frontend/src/components/games/RuffleFlash.tsx`)
loads the **self-hosted** Ruffle runtime from `RUFFLE_URL`
(`/ruffle/ruffle.js`) and plays either a bundled `/games/*.swf` or an
allow-listed https `.swf`. It never pulls Ruffle from a third-party CDN, so it
satisfies `script-src 'self'`.

**Install step (documented, required):** copy a Ruffle release into
`src/frontend/public/ruffle/` (`ruffle.js` + `*.wasm`). Until then the panel
shows a setup hint instead of a blank screen.

### 2.4 Untrusted game code must stay isolated from crypto state — S1 (fixed)
Game/frame code must never reach the room secret, derived session key, or our
DOM.

**Fixed:** external games run only inside the sandboxed, opaque-origin iframe
described in §2.2; the built-in games are our own React components and never
touch `crypto`. The room secret lives in the URL **fragment**, which is not
sent to the relay or to any frame.

### 2.5 Licensing / bundling of `.swf` titles — S3 (documented)
Shipping commercial `.swf` files may violate their license. Bundle only
public-domain / freely-licensed titles (e.g. from the Internet Archive's
collections) and keep attribution.

---

## 3. The blank-screen failure mode (S1 — fixed)

Two independent bugs could leave a user staring at an empty white page
immediately after creating a room and pressing **Done**.

### 3.1 Peer roster wire format vs. UI type — S1 (fixed)

The relay speaks snake_case (`peer_id`, `alias`, `is_host`, `has_key`); the UI
model `Peer` (`src/frontend/src/lib/types.ts`) is camelCase (`peerId`,
`isHost`, `hasKey`). The raw payload was assigned straight to `Peer[]`, so
`ParticipantList` rendered `p.peerId.replace('p_', '')` on `undefined`, the
exception propagated out of render, React unmounted the whole tree, and the
page went blank — with no error UI and no console hint for the user.

**Fix:**
- `src/frontend/src/lib/peers.ts` — `normalizePeer()` / `normalizePeers()`
  convert the wire payload to the UI shape at the boundary, accepting either
  convention so a rolling deploy cannot break a live tab.
- `src/frontend/src/components/ParticipantList.tsx` — renders defensively; a
  malformed peer id can no longer throw.
- `src/frontend/src/components/ErrorBoundary.tsx` — wraps the router
  (`App.tsx`) so *any* future render crash shows the error and a reload
  button instead of a silent blank page.
- `src/backend/tests/test_relay_scale.py::TestPeerRosterContract` — pins the
  exact `peer_list` key set so a rename breaks CI, not the UI.

### 3.2 Cached SPA shell served a stale bundle — S1 (fixed)

`index.html` was served with no `Cache-Control`, so browsers applied
heuristic caching and kept the shell pointing at an old hashed bundle after
a deploy. Two tabs could therefore run *different* code — one crashing, one
working — which looks like a flaky app rather than a deploy artifact.

**Fix:** `location = /index.html` in `src/frontend/nginx.conf` now sends
`Cache-Control: no-cache, no-store, must-revalidate` (the shell always
revalidates; hashed assets stay `immutable` for a year).

**Symptoms to recognise:** white page, no React tree (`#root` empty), and in
DevTools a `TypeError` such as `Cannot read properties of undefined (reading
'replace')` originating in an `Array.map` inside the roster.

---

## 4. Cross-cutting: relay scaling

`ConnectionManager` (`src/backend/app/websocket_manager.py`) keeps connections
in **process memory**. Redis is used only for slots, one-time join tokens,
pubkeys, and rate buckets — not for fan-out.

**Impact:** the backend cannot be horizontally scaled without either:
- sticky sessions at the load balancer **plus** Redis pub/sub (or Redis
  Streams) to relay frames between instances, or
- a dedicated WebSocket gateway.

**Status:** Documented. Single-instance is fine for the current 8-participant
cap; revisit before scaling out.

---

## 5. Test matrix

Automated (backend, `tests/test_relay_scale.py` + `tests/test_relay_extensions.py`):

| Case | Coverage |
|------|----------|
| Single user | lone participant count, no self-echo on broadcast |
| Multi user | 8-peer roster, capacity rejection (409), targeted isolation, broadcast fan-out, full-mesh volume |
| Rate limits | per-IP signal budget exhausts and returns an error |
| Relay | oversized frame rejection, unknown target error, alias roster |
| Contract | `peer_list` key set pinned (`peer_id`/`alias`/`is_host`/`has_key`) so a rename fails CI instead of blanking the UI |

Frontend: `npm run build` (strict `tsc`) is the type gate; the arcade and voice
UI are additionally validated by an end-to-end WebSocket smoke test against the
running Docker stack.

Browser-level (headless Chrome over the DevTools Protocol, two tabs — host +
guest joining the invite URL): the room screen renders, the roster shows both
participants, mutual key confirmation reaches `CONFIRMED (2/2)`, and the
console stays free of uncaught exceptions. This is the regression test for the
blank-screen failure mode in section 3.

Not yet automated (needs a browser/Playwright + a TURN/STUN test rig):
real WebRTC media flow, autoplay/Konami behaviour, and Ruffle playback.

---

## 6. Change log (this pass)

- Backend: `PERMISSIONS_POLICY` setting (`microphone=(self)`); CSP extended with
  `frame-src`, `worker-src`, `media-src`, `'wasm-unsafe-eval'`.
- Frontend infra: strict CSP + mic-permitting `Permissions-Policy` on
  `nginx.conf` and the Caddyfiles.
- `webrtc.ts`: configurable ICE via `loadIceServers()` / `hasTurnConfigured()`;
  `AudioContext` resume; connection-state surfaced to the UI.
- `RoomScreen.tsx` / `VoicePanel.tsx`: key-gated voice, peer-leave media
  cleanup, `failed` connection hint, TURN hint when STUN-only.
- Games: `GameMeta.kind/runtime/url`; built-in **Brick Breaker**; sandboxed
  **Web Arcade** (external HTML5); self-hosted **Flash Vault** via Ruffle.
- Tests: `tests/test_relay_scale.py` (single/multi-user, capacity, rate limit,
  peer-roster wire contract).
- Blank-screen fixes: `lib/peers.ts` roster normaliser, defensive
  `ParticipantList`, `ErrorBoundary` around the router, `no-cache` on the SPA
  shell (see section 3).
