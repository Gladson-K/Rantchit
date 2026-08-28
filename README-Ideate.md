
# Rantchit (Chat with Randomness at Once) — Design and Implementation Blueprint

*This document outlines the architecture, security model, and implementation plan for Rantchit, a privacy-preserving one-time conversation application. It is **not** a claim of production security. The design follows standard cryptographic primitives and security best practices but must undergo independent review before deployment.*

---

## 1. Pre‑Implementation Analysis

### 1.1 Assumptions
- The application will be deployed in a managed cloud environment with TLS termination.
- Users have access to modern browsers or Android devices supporting WebCrypto and secure keystore.
- The backend infrastructure (database, Redis, servers) is trusted and hardened.
- Administrators are honest but may make operational mistakes; the system must minimize the impact of such mistakes.
- The MVP will support only ephemeral two‑party text chat, no persistence beyond room lifetime.
- Legal requirements (GDPR, CCPA) will be considered for metadata retention but not fully implemented in the MVP.

### 1.2 Assets Being Protected
| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Message plaintext | Extremely high (ephemeral) | Client memory only |
| Encryption keys (ephemeral) | Extremely high | Client memory / secure storage |
| Invitation URL fragment (contains room key) | Very high (single‑use) | Shared out‑of‑band |
| Room identifiers & tokens | High (short‑lived) | Client memory, Redis |
| Room metadata (timestamps, status) | Medium | PostgreSQL, Redis |
| Participant aliases | Medium (ephemeral) | Client memory, Redis (temporarily) |
| IP addresses | Medium | Reverse proxy logs (if enabled), rate‑limit buckets |

### 1.3 Trusted and Untrusted Components
**Trusted** (assumed not malicious, but may be compromised):
- Client applications (after proper key generation and TLS validation)
- Backend application code (but not necessarily the database or logs)
- TLS termination (Caddy/Nginx) configuration

**Untrusted**:
- The network (potential MITM – mitigated by TLS and SAS verification)
- The database (compromised or malicious admin) – must never see plaintext or keys
- Redis (compromised) – only short‑lived tokens and encrypted envelopes if unavoidable
- Logging and monitoring systems – must mask sensitive data
- Other users (malicious peer) – cannot be prevented from taking screenshots, etc.

### 1.4 Threat Actors
- **Passive eavesdropper** on the network – mitigated by TLS.
- **Active MITM** – mitigated by TLS certificate pinning and optional SAS verification.
- **Malicious backend operator** – design ensures backend cannot read messages or keys.
- **Compromised database** – no plaintext or keys stored.
- **Malicious peer** – can record conversation, impersonate (during initial handshake) – SAS verification helps.
- **Endpoint malware** – out of scope; cannot be prevented.
- **Abusive user** – tries to create many rooms, spam, or DoS – mitigated by rate limits and atomic slot claiming.

### 1.5 Known Limitations
- **No forward secrecy in MVP?** We will implement ephemeral Diffie‑Hellman key exchange using X25519 for each room, providing forward secrecy for the session. However, if a device is compromised during the conversation, all plaintext is accessible.
- **Metadata exposure**: server knows IP addresses (during connection), room creation time, and duration. It does not know aliases or message content.
- **Screenshots and cameras**: cannot be prevented.
- **Link security**: the invitation link is single‑use but could be intercepted if sent over insecure channels; the SAS step mitigates but does not eliminate.
- **No message history**: by design.

### 1.6 Security Decisions Requiring External Review
- The exact cryptographic protocol construction (X25519 + HKDF + AES‑GCM).
- WebSocket authentication flow using one‑time room tokens.
- Origin validation and CSRF protections.
- Rate limiting and abuse prevention thresholds.
- Privacy policy wording and legal compliance.

---

## 2. High‑Level Architecture

Rantchit uses a client‑server model where the server only relays encrypted envelopes and manages room lifecycle. All encryption is end‑to‑end using ephemeral keys generated on client devices.

### Components
- **Web Client**: React + TypeScript, served statically.
- **PWA**: Same codebase with manifest and service worker.
- **Flutter Client**: Android app using secure storage.
- **Backend**: FastAPI (Python) with async WebSockets.
- **PostgreSQL**: Permanent room metadata (no message content).
- **Redis**: Short‑lived room state, tokens, rate limits.
- **Reverse Proxy**: Caddy (or Nginx) for TLS termination and static file serving.

### Data Flow
1. Creator generates `roomKeyPair` (X25519) and `roomSecret` (random 32 bytes) in browser/mobile.
2. Client sends `create_room` request with a hash of `roomSecret` (not the secret itself) and optional expiry.
3. Server creates a room record (ID = UUIDv4) and returns the room ID.
4. Client constructs invitation URL: `https://domain/#<roomId>?k=<base64url(roomSecret)>` (fragment only).
5. Creator shares link. Recipient opens link, extracts `roomId` and `roomSecret` from fragment (never sent to server).
6. Recipient connects to WebSocket with the `roomId` and a one‑time token obtained from server via a join request (using `roomSecret` to authenticate).
7. Both clients exchange their public keys via the WebSocket, derive shared secret via X25519, verify SAS (short auth string), then encrypt messages using AES‑GCM.
8. Server relays encrypted messages, enforcing message size and rate limits.

---

## 3. Product Requirements Document (PRD)

### Goals
- Enable two strangers to have a private, ephemeral chat without registration.
- Ensure the server cannot read messages or store keys.
- Provide a simple, accessible interface.

### User Stories
- As a user, I want to create a room and get a shareable link.
- As a user, I want to join a room using a link and choose a temporary alias.
- As a user, I want to chat with the other participant knowing messages are end‑to‑end encrypted.
- As a user, I want to verify the identity of the other participant via a short verification phrase.
- As a user, I want to be able to leave or destroy the room at any time.
- As a user, I want the room to expire automatically after a set time or inactivity.

### Functional Requirements
- Create room with client‑generated key material.
- Generate single‑use invitation link (fragment holds secret).
- Enforce exactly two participants (atomic claim).
- End‑to‑end encryption using X25519 + HKDF + AES‑GCM.
- SAS verification (numeric or word list) to detect MITM.
- WebSocket‑based message exchange with encrypted envelopes.
- Room destruction: both parties forced to disconnect; all server data cleared.
- Expiry countdown visible in UI.
- Responsive and accessible (WCAG 2.1 AA).

### Non‑Functional Requirements
- Latency: message delivery < 300ms under normal conditions.
- Availability: 99.9% uptime.
- Security: TLS 1.3, strict CSP, no logging of sensitive data.
- Scalability: support at least 1000 concurrent rooms.

---

## 4. Threat Model, Trust Boundaries, Abuse & Misuse Cases

### Trust Boundaries
- **Client ↔ Client**: Untrusted network, encrypted channel with mutual authentication via SAS.
- **Client ↔ Backend**: TLS 1.3; backend is trusted not to read message contents, but may attempt to log metadata.
- **Backend ↔ Database**: Backend authenticated; database may be compromised.
- **Backend ↔ Redis**: Same as above.
- **Backend ↔ Reverse Proxy**: Both trusted; reverse proxy terminates TLS.

### Abuse Cases
- **Room flooding**: Attacker creates thousands of rooms to exhaust resources. Mitigation: per‑IP rate limit on room creation.
- **Token brute‑force**: One‑time join token is high‑entropy and expires quickly; rate limited.
- **Message spam**: Attacker sends many large messages. Mitigation: message size and frequency limits.
- **Slot squatting**: Attacker joins and never leaves. Mitigation: room expiry and creator can destroy.
- **Link guessing**: Room ID is UUIDv4; room secret is 256‑bit random; infeasible.

### Misuse Cases
- **User shares link publicly**: Anyone can join first; the remaining slot is claimed by first joiner. If unwanted, creator can destroy room.
- **User screenshots**: No technical mitigation; disclosed in privacy notice.
- **User uses a compromised device**: Out of scope.

---

## 5. Architecture Decision Records (ADRs)

### ADR‑001: Use Web Crypto API and X25519 for E2EE
- **Decision**: Use X25519 for key agreement, HKDF for key derivation, AES‑256‑GCM for message encryption.
- **Rationale**: Standard, widely reviewed primitives; available in browsers and Flutter (via pointycastle or cryptography package).
- **Alternatives**: RSA (no forward secrecy), Signal protocol (overkill, needs pre‑keys).

### ADR‑002: Invitation Secret in URL Fragment
- **Decision**: Place room secret in URL fragment (`#...`) to avoid server logs and HTTP referer leaks.
- **Rationale**: Fragment is not sent to server; browser JS can parse it.

### ADR‑003: Use Redis for Atomic Slot Claiming
- **Decision**: Use Redis `SET NX` to atomically claim the second participant slot.
- **Rationale**: Prevents race conditions when two users try to join simultaneously.

### ADR‑004: No Store‑and‑Forward
- **Decision**: Messages are only relayed in real‑time; no ciphertext stored on server.
- **Rationale**: Simplifies privacy guarantees; reduces attack surface.

### ADR‑005: Enforce Strict CSP
- **Decision**: Use strict Content Security Policy with `'self'` only; no inline scripts.
- **Rationale**: Prevents XSS from rendering message content.

---

## 6. Complete Monorepo Project Structure

```
Rantchit/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── security-scan.yml
├── docs/
│   ├── architecture.md
│   ├── threat-model.md
│   ├── adr/
│   ├── api/
│   ├── deployment.md
│   ├── privacy-notice.md
│   ├── security-disclosure.md
│   ├── incident-response.md
│   └── acceptance-criteria.md
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── redis_client.py
│   │   ├── security.py
│   │   ├── websocket_manager.py
│   │   ├── endpoints/
│   │   │   ├── rooms.py
│   │   │   └── health.py
│   │   └── utils/
│   ├── alembic/
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── alembic.ini
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── mobile/  (Flutter)
│   ├── lib/
│   │   ├── main.dart
│   │   ├── screens/
│   │   ├── services/
│   │   ├── crypto/
│   │   └── models/
│   ├── android/
│   ├── ios/
│   ├── pubspec.yaml
│   └── Dockerfile (optional)
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── caddy/
│   │   └── Caddyfile
│   ├── postgres/
│   │   └── init.sql
│   └── k8s/
│       ├── backend-deployment.yaml
│       ├── frontend-deployment.yaml
│       ├── postgres-statefulset.yaml
│       └── redis-deployment.yaml
├── .env.example
├── SECURITY.md
├── README.md
└── .gitignore
```

---

## 7. OpenAPI Specification (High‑Level)

Only HTTP endpoints (REST) are defined; WebSocket is separate. The backend exposes minimal REST for room creation and token exchange.

```yaml
openapi: 3.0.3
info:
  title: Rantchit API
  version: 1.0.0
paths:
  /api/v1/rooms:
    post:
      summary: Create a new room
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                room_secret_hash:  # SHA-256 of room secret (base64url)
                  type: string
                expires_in_minutes:
                  type: integer
                  default: 60
              required: [room_secret_hash]
      responses:
        '201':
          description: Room created
          content:
            application/json:
              schema:
                type: object
                properties:
                  room_id: { type: string }
                  expires_at: { type: string, format: date-time }
                  max_participants: { type: integer, enum: [2] }
        '429':
          description: Rate limit exceeded
  /api/v1/rooms/{room_id}/join-token:
    post:
      summary: Request one-time join token (authenticated by room secret)
      parameters:
        - name: room_id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                room_secret: { type: string }  # sent over TLS
      responses:
        '200':
          description: Join token issued
          content:
            application/json:
              schema:
                type: object
                properties:
                  token: { type: string }
                  expires_in_seconds: { type: integer }
        '403': { description: Invalid secret or room full }
        '410': { description: Room expired }
```

---

## 8. WebSocket Protocol Specification

### Connection URL
`wss://domain/ws/chat?room_id=<uuid>&token=<one-time-token>`

### Handshake
- Client includes a short‑lived token obtained from `/join-token` REST endpoint.
- Server validates token, room existence, and single‑use.
- Server checks Origin header against allowed origins.
- Upon success, server assigns a connection ID and sends a `welcome` message.

### Message Envelope (JSON over WebSocket)
All messages are JSON objects with a `type` field. Client‑to‑server messages are plain JSON but contain an `encrypted_payload` field (base64) which the server does not decrypt.

```json
{
  "type": "message",
  "nonce": "base64url",          // unique per message
  "encrypted_payload": "base64"  // contains ciphertext + auth tag
}
```

Server relays this to the other participant without inspecting payload.

**Server‑generated control messages**:
- `participant_joined` (with peer public key)
- `participant_left`
- `room_destroyed`
- `error`
- `pong` (for heartbeat)

### Limits
- Max message size: 16 KB (including envelope)
- Rate limit: 10 messages per second per connection
- Connection duration: max room lifetime (default 60 minutes)
- Heartbeat: client must send `ping` every 30 seconds or be disconnected

---

## 9. Database Model and Migrations

### PostgreSQL Schema

**Table: rooms**
| Column        | Type         | Description                                |
|---------------|--------------|--------------------------------------------|
| id            | UUID         | Primary key, room identifier               |
| secret_hash   | VARCHAR(64)  | SHA-256 of room secret (hex)               |
| status        | VARCHAR(16)  | 'active', 'destroyed', 'expired'           |
| created_at    | TIMESTAMPTZ  |                                            |
| expires_at    | TIMESTAMPTZ  |                                            |
| destroyed_at  | TIMESTAMPTZ  | Nullable                                   |
| max_participants | SMALLINT   | Always 2                                   |
| participant_count | SMALLINT  | 0, 1, or 2 (for informational purposes)    |
| ip_hash       | VARCHAR(64)  | HMAC of creator IP (for rate limiting)     |

**No message table, no alias storage.**

Alembic migration: create `rooms` table.

---

## 10. Redis Key Model and TTL Rules

Redis is used for ephemeral state. All keys have a TTL matching room expiration (or shorter).

| Key Pattern                          | Type   | Purpose                                  | TTL           |
|--------------------------------------|--------|------------------------------------------|---------------|
| `room:{room_id}:slots`               | String | Atomic counter (INCR) to enforce 2 max   | Room lifetime |
| `room:{room_id}:token:{token}`       | String | One‑time join token → valid flag         | 2 minutes     |
| `room:{room_id}:participants`        | Set    | Connection IDs of active participants    | Room lifetime |
| `room:{room_id}:peer_pubkey`         | String | Public key of first participant (creator)| Room lifetime |
| `ratelimit:ip:{ip_hash}:create`      | String | Rate limit bucket for room creation      | 1 hour        |
| `ratelimit:ip:{ip_hash}:messages`    | String | Rate limit bucket for messages           | 1 minute      |
| `ratelimit:room:{room_id}:messages`  | String | Per‑room message rate                    | 1 minute      |

Upon room destruction or expiry, all keys with prefix `room:{room_id}:` are deleted. Rate limit buckets expire naturally.

---

## 11. React Web Client Design

### Key Components
- **App**: routing, context providers.
- **HomeScreen**: create room, generate alias.
- **RoomScreen**: chat interface, connection status, expiry countdown, verification.
- **VerificationModal**: display SAS phrase or QR.
- **InviteModal**: copy/share link.

### Security Measures
- All cryptographic operations use Web Crypto API (`crypto.subtle`).
- Room secret stored only in memory (not localStorage).
- Message rendering as plain text (`textContent`), never `innerHTML`.
- Strict CSP via meta tag or response headers.
- Service worker for PWA (cache static assets only).
- No third‑party scripts or analytics.

### Accessibility
- Semantic HTML, ARIA labels, keyboard navigation.
- Focus management for modals.
- Color contrast compliant (WCAG AA).

---

## 12. Flutter Android Client Design

### Key Features
- Use `cryptography` package (Dart) for X25519 and AES‑GCM.
- Store ephemeral keys in `flutter_secure_storage` with Android Keystore backing.
- WebSocket via `web_socket_channel`.
- Similar screens as web.

### Platform Security
- Use Android Network Security Config to enforce TLS.
- Enable certificate pinning for production domain (optional but recommended).
- Never log sensitive data.
- ProGuard/R8 rules to avoid stripping crypto classes.

---

## 13. FastAPI Backend Design

### Modules
- `main.py`: FastAPI app, middleware, lifespan.
- `config.py`: Settings from environment.
- `models.py`: SQLAlchemy models.
- `schemas.py`: Pydantic schemas for request/response validation.
- `database.py`: Async SQLAlchemy engine and session.
- `redis_client.py`: Async Redis connection (aioredis).
- `security.py`: HMAC for IP hashing, token generation, rate limiting helpers.
- `websocket_manager.py`: Manage active connections and room routing.
- `endpoints/rooms.py`: REST endpoints.
- `endpoints/ws.py`: WebSocket endpoint.

### Security Implementation
- Origin validation: compare `Origin` header against allow‑list (e.g., `https://app.Rantchit.example`).
- Token validation: one‑time, short‑lived, bound to room ID.
- Input validation: strict size limits, JSON schema.
- Rate limiting: Redis‑based token bucket per IP and per room.
- Structured security logs: JSON logs with `event_type`, `room_id` (hashed), `ip_hash`, but never raw IP or secrets.
- CORS: restrict to exact frontend origin.

---

## 14. Dockerfiles and Docker Compose

### Backend Dockerfile
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile (multi‑stage)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### Docker Compose (dev)
```yaml
services:
  postgres:
    image: postgres:16
    environment: ...
    volumes: ...
  redis:
    image: redis:7-alpine
  backend:
    build: ./backend
    environment: ...
    depends_on: [postgres, redis]
  frontend:
    build: ./frontend
    ports: ["8080:80"]
  caddy:
    image: caddy:2
    ports: ["443:443", "80:80"]
    volumes: ./caddy/Caddyfile:/etc/caddy/Caddyfile
    depends_on: [backend, frontend]
```

---

## 15. Environment Variable Template (`.env.example`)

```env
# Database
POSTGRES_USER=Rantchit
POSTGRES_PASSWORD=change_me
POSTGRES_DB=Rantchit
DATABASE_URL=postgresql+asyncpg://Rantchit:change_me@postgres:5432/Rantchit

# Redis
REDIS_URL=redis://redis:6379/0

# Security
SECRET_KEY=change_me_use_random_64_bytes
ALLOWED_ORIGINS=https://app.Rantchit.example
ROOM_DEFAULT_TTL_MINUTES=60
ROOM_MAX_TTL_MINUTES=1440
MESSAGE_MAX_BYTES=16384
RATE_LIMIT_CREATE_PER_HOUR=10
RATE_LIMIT_MESSAGES_PER_MINUTE=30
WS_HEARTBEAT_SECONDS=30

# Logging
LOG_LEVEL=INFO
```

---

## 16. Test Suite

### Unit Tests
- **Backend**: Pydantic validation, rate limiting logic, room lifecycle.
- **Frontend**: React component rendering, crypto functions.
- **Flutter**: crypto service, model parsing.

### Integration Tests
- REST endpoints: create room, get join token, destroy room.
- WebSocket handshake and message relay.
- Database/Redis interaction with test containers.

### Protocol Tests
- Verify E2EE: two simulated clients exchange keys, encrypt/decrypt.
- Verify SAS generation and matching.
- Verify forward secrecy (derive different keys per session).

### Security Tests
- Fuzz WebSocket inputs.
- Attempt to join room with invalid token.
- Attempt to exceed slot limit (concurrent joins).
- Check Origin validation.
- Verify no plaintext appears in logs (mock logger).

### End‑to‑End Tests
- Use Playwright (web) and integration tests (Flutter) to simulate complete user journey.
- Verify room destruction cleans up Redis and database.

---

## 17. CI/CD Workflow (GitHub Actions)

```yaml
name: CI
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f infra/docker-compose.test.yml up -d postgres redis
      - run: cd backend && pip install -r requirements-dev.txt && pytest
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd frontend && npm ci && npm run test
  mobile-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: cd mobile && flutter test
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          path: '.'
```

The workflow includes dependency scanning (Trivy), container scanning, and SBOM generation.

---

## 18. Deployment and Rollback Documentation

### Deployment
- Use Kubernetes manifests in `infra/k8s/` or Docker Compose for smaller deployments.
- Secrets are injected via environment variables from a secret manager (e.g., Vault, AWS Secrets Manager).
- TLS termination at Caddy/Ingress.
- Database migrations run as a separate job before rolling out new backend version.

### Rollback
- Keep previous Docker images tagged.
- Use `kubectl rollout undo` or `docker compose down && docker compose up` with previous version.
- Database rollback (if needed) via Alembic downgrade.

---

## 19. Privacy Notice Template

*(Summarized)*
- Rantchit allows two users to chat privately without registration.
- We collect minimal metadata: IP address (hashed), room creation/expiry times, and connection duration.
- Messages are end‑to‑end encrypted; we cannot read them.
- Room content is deleted immediately upon room destruction or expiry.
- We do not use third‑party analytics or advertising.
- Legal obligations: may disclose metadata if required by law.
- Limitations: cannot prevent screenshots, malware, or ISP surveillance.

---

## 20. Security Disclosure Policy

- Report vulnerabilities to `security@Rantchit.example` (PGP key available).
- We will acknowledge within 48 hours and provide a timeline for fix.
- Do not publicly disclose until a fix is released.

---

## 21. Incident‑Response Runbook

1. **Detection**: Monitoring alerts, user reports, unusual traffic.
2. **Containment**: Isolate affected systems, revoke tokens, block IPs.
3. **Eradication**: Patch vulnerability, rotate secrets, clear Redis.
4. **Recovery**: Restore service, monitor.
5. **Post‑mortem**: Document timeline, improve controls.

---

## 22. Definition of Done and Acceptance Criteria

### DoD
- All MVP features implemented and tested.
- Unit/integration/e2e tests pass.
- Security scans clean (no critical vulnerabilities).
- Code reviewed and approved by at least two developers.
- Documentation updated.
- Privacy notice and security policy published.
- No plaintext or keys visible in logs/database.

### Acceptance Criteria (Example)
- User can create room, share link, and join with two participants only.
- Messages are encrypted and cannot be decrypted by server.
- SAS verification works and mismatches are detected.
- Room destroys correctly and cleans all server data.
- Application is responsive and passes WCAG 2.1 AA checklist.
- Rate limits block abuse without impacting normal usage.

---

*This blueprint is a starting point. Implementation must be followed by thorough code review, dependency audits, penetration testing, infrastructure hardening, privacy review, and independent cryptographic assessment before production deployment.*