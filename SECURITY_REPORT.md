# Rantchit — Security Assessment & XBF-MKC Protocol Report

**Date:** 2026-10-19
**Scope:** Full-stack security review of the Rantchit E2EE 1-on-1 chat application (FastAPI/PostgreSQL/Redis backend, React/TS/WebCrypto frontend), remediation of all findings, implementation of the XBF-MKC v1 handshake, and end-to-end verification (54 automated tests, including two real-browser GUI journeys).

---

## 1. Findings & Remediation

All findings below were identified during the audit and have been fixed and regression-tested.

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| F1 | **Critical** | SAS was one-sided (each peer hashed only its own public key), so both users could display identical codes **even with a MITM present**. The verification UI was cryptographically meaningless. | Replaced by XBF-MKC cross-bound transcript (§2): SAS is derived over `SHA256(sorted(pubA,pubB))`, so transcripts — and therefore SAS codes — diverge the moment keys are substituted. |
| F2 | **High** | WebSocket Origin check used substring matching (`"localhost" in origin`), allowing trivial origin spoofing (`evil-localhost.evil`). | Exact-match allowlist in `security.is_allowed_ws_origin` (`app/security.py`). |
| F3 | **High** | Room-secret comparison in `rooms.py` was non-constant-time (`==`), enabling timing side-channels on `room_secret_hash`. | `safe_secret_compare` (HMAC-based constant-time compare). |
| F4 | **Medium** | No rate limit on `POST /rooms/{id}/join`; join tokens could be brute-forced. | Per-IP join limiter (30/min default) alongside create (100/h) and destroy (30/h) limits. |
| F5 | **Medium** | Join-token consumption was read-then-delete (TOCTOU): two concurrent WS accepts could consume the same token and overflow the 2-participant slot. | Atomic `GETDEL` before slot claim; slot `INCR` moved to WS-accept time with rollback `DECR` on failure/disconnect. |
| F6 | **Medium** | Any authenticated WS client could send `{type:"destroy"}` and nuke the room without presenting the room secret. | `destroy` handled from the `leave` path only destroys that participant's session; the API destroy still requires the secret. |
| F7 | **Medium** | `/health` returned raw exception details (info disclosure). | Internal errors redacted to `{"status":"degraded"}`. |
| F8 | **Medium** | No security headers on API responses (no CSP, `X-Frame-Options`, `Referrer-Policy`, etc.). | Global middleware sets CSP (configurable), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS opt-in. |
| F9 | **Low** | Per-connection public keys were held only in an `asyncio` dict with no lifecycle; stale keys survived reconnects. | Per-connection key registry in `websocket_manager.py`, cleared on disconnect; peer keys exposed via `get_peer_pubkeys`. |
| F10 | **Low** | `ALLOW_MISSING_ORIGIN` substring semantics; health-check port defaults leaked. `SECRET_KEY` default was a fixed string. | Exact origin match; docs disabled by env (`ENABLE_DOCS`); proxy-header trust off by default (`TRUST_PROXY_HEADERS`); secret now required to be overridden in production (change it in `.env`). |
| F11 | **Low** | No rate limit on `/api/v1/ws`-adjacent WS frames; oversized/hostile frames possible. | Frame size cap (16 KiB), strict JSON schema per frame type, and public-key format validation (`P-256` uncompressed point, base64url, exact length) before relay. |

**Not previously found, now covered by tests:** single-use join token enforcement, participant-slot release on disconnect, and WS handshake after token exhaustion.

---

## 2. XBF-MKC v1 Protocol (`RANTCHIT-XBF-MKC-v1`)

Named construction: **X**bound **B**inding **F**unction — **M**utual **K**ey **C**onfirmation.

```
roomSecret (32 random bytes)  ──#fragment──►  never sent over HTTP
roomSecretHash = SHA256(roomSecret)          ──► POST /rooms (server sees only the hash)

T        = SHA256("PROTO_ID | roomSecretHash | " || sort(pubA, pubB))     (ECDH P-256)
K_enc    = HKDF-SHA256(ECDH_bits, salt=SHA256(roomSecretHash), info="PROTO|enc|T")
K_mac    = HKDF-SHA256(ECDH_bits, salt=SHA256(roomSecretHash), info="PROTO|mac|T")

tag_A    = HMAC-SHA256(K_mac, "PROTO|mkc|T")        (sent as {type:"key_confirm"})
          ── peer verifies; failure = hard-fail (MITM banner, messaging locked)

AES-256-GCM(nonce‖ciphertext), AAD = "PROTO|T"
SAS      = SHA256("RANTCHIT-SAS|" || T) → 6-hex code + 4 emojis + 3 words
```

### Security argument
- **Confidentiality/authenticity:** AES-256-GCM under a key only two ECDH participants can derive; AAD binds every ciphertext to the full session transcript (no cross-room/cross-session replay).
- **Active MITM detection:** a key-substituting attacker creates *different transcripts* on each side → `K_mac` differs → MKC tags fail on both sides (banner shown, input disabled), **and** SAS codes visibly diverge. Detection is automatic (MKC) plus human-verifiable (SAS).
- **Room binding:** the server-known `roomSecretHash` is inside `T`, so keys from one room cannot be transplanted to another; the raw secret never leaves the client (URL fragment is never transmitted).
- **Zero knowledge of the relay:** the server handles only opaque frames `{type:"message", nonce, encrypted_payload}`. Verified end-to-end: no plaintext or room-secret fragment appears in any WS frame sent by either browser (asserted by the GUI test).
- **Fixed F1:** both sides sort the two public keys into one transcript — with honest keys both derive identical `T`/SAS; with tampered keys neither side can agree.

### Honest assessment (important)
XBF-MKC is a **novel composition of vetted primitives** (ECDH P-256, HKDF-SHA256, HMAC-SHA256, AES-256-GCM), **not a new cryptographic primitive**. Its properties are inherited from those primitives plus the transcript-binding pattern (the same family of constructions as Signal's X3DH/SAS and TLS exporters). It has not been reviewed by third-party cryptographers and should not be treated as a formally verified protocol.

**Known limitations / recommendations:**
1. **No forward secrecy across sessions or post-compromise security** — there is no ratchet. Compromise of `K_enc` exposes that room's entire history. Consider X3DH + Double Ratchet for long-lived chats.
2. **One-time ECDH keypair per page load** — a reconnect re-keys the session; robust but noisy (new SAS each reload). Long-term identity keys are absent; SAS currently authenticates the *session*, not a user identity.
3. **`connect-src ws: wss:` in CSP is broad** — tighten to the exact WS origin in production.
4. **`WS_ALLOW_MISSING_ORIGIN: True` by default** — appropriate for CLI/test clients; set `False` in hardened deployments (origin is already exact-matched when present).
5. **Rate limits are per-IP** — with `TRUST_PROXY_HEADERS` enabled behind Caddy, ensure the proxy sets `X-Forwarded-For` correctly or limits become spoofable.
6. The SAS *word list* is a small curated English list; for non-English speakers the 6-hex + 4-emoji channels are sufficient.
7. `SECRET_KEY` and `ALLOWED_ORIGINS` must be overridden via `.env` in production; defaults are for development.

---

## 3. Verification Evidence

```
54 passed in 14.20s   (pytest tests/, incl. 2 Playwright GUI tests)
```

**Backend/protocol suite (52):**
- `test_protocol_vectors.py` — Python reference implementation (`tests/xbf.py`) vs fixed vectors; SAS wordlist/emoji determinism.
- `test_security_units.py` — constant-time compare, exact-origin allowlist, IP extraction, pubkey validation, hex64 schema.
- `test_api_endpoints.py` — room lifecycle, TTL, rate limits, 409 on full room, join/destroy auth.
- `test_ws_protocol.py` — two-client E2EE relay, atomic single-use token, slot release on disconnect, origin enforcement, frame caps, and an in-process **rewriting-MITM proxy** proving tag mismatch.

**GUI end-to-end (Playwright, real Chromium, `tests/test_gui_e2e.py`):**
1. **Happy path** — User A creates a room in the browser, copies the invite link, User B opens it in a separate browser context; both reach `Confirmed (2/2)`; SAS codes and emoji fingerprints **match**; messages flow both ways decrypted; asserted that **no plaintext and no room-secret fragment ever appears in any WebSocket frame sent by either page**.
2. **MITM path** — an active relay rewrites every `public_key` frame with fresh attacker keys; both screens show the `MITM DETECTED` banner, SAS codes **differ**, and the message input stays disabled with a security-failure placeholder.

### Reproduce
```bash
cd src/backend
# unit + integration (requires LD_LIBRARY_PATH for headless chromium GUI tests)
LD_LIBRARY_PATH=/tmp/opencode/sysroot/usr/lib/x86_64-linux-gnu \
  /tmp/opencode/venv/bin/python -m pytest tests/ -q
# frontend typecheck + build
cd ../frontend && npm run build
```
