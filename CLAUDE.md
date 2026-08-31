# Rantchit — Developer & Assistant Guide (`CLAUDE.md`)

## Project Overview
**Rantchit** is an ephemeral, zero-knowledge, end-to-end encrypted 1-on-1 private chat application.
The server acts as an encrypted relay and room lifecycle coordinator. No plaintext messages or private key material are ever stored or processed on the server.

---

## Core Technologies
- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0 (asyncpg), Redis 7 (asyncio), Uvicorn, Alembic.
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Web Crypto API (`crypto.subtle`).
- **Infra**: Docker Compose, Nginx (Alpine), Caddy 2, PostgreSQL 16.

---

## Essential Commands

### Docker Compose (Full Stack)
```bash
# Build and run the entire stack
docker compose up -d --build

# View container logs
docker compose logs -f

# Stop and remove volumes
docker compose down -v
```

### Backend Commands
```bash
cd src/backend
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run tests
pytest
```

### Frontend Commands
```bash
cd src/frontend
# Install dependencies
npm install

# Run dev server
npm run dev

# Build production bundle
npm run build
```

---

## Key Architecture & Code Conventions

1. **Zero Knowledge / E2EE Protocol**:
   - Client generates 32-byte random `roomSecret`, stored in URL fragment (`#<secret>`). Never transmitted in plain HTTP.
   - Client calculates `SHA256(roomSecret)` as `room_secret_hash` for room creation via `POST /api/v1/rooms`.
   - Ephemeral ECDH keypair (P-256 / X25519) is generated in memory.
   - HKDF derives a 256-bit AES-GCM session key from ECDH shared bits.
   - Messages are encrypted client-side with AES-256-GCM and unique 12-byte random nonces before WebSocket transmission.
   - SAS (Short Authentication String) is displayed for user visual confirmation to mitigate MITM.

2. **Backend Concurrency & State**:
   - PostgreSQL only stores room metadata (`id`, `secret_hash`, `status`, `expires_at`, `ip_hash`).
   - Redis manages atomic participant slot checks (max 2 via `INCR`), one-time join tokens (120s TTL), ephemeral public keys, and rate limit buckets.
   - WebSockets relay JSON payloads: `{ type: "message", nonce, encrypted_payload }`.
   - The server must NEVER attempt to inspect or persist `encrypted_payload`.

3. **Frontend UI/UX**:
   - Modern dark/light responsive interface built with TailwindCSS.
   - Clear indicators for room TTL countdown, participant connection status, and SAS verification match status.
   - Instant "Destroy Room" action to nuke room and invalidate all keys.
