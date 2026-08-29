# Rantchit (Chat with Randomness at Once) — Design and Implementation Blueprint

*This document outlines the architecture, security model, and implementation plan for Rantchit, a privacy-preserving one-time conversation application. It is **not** a claim of production security. The design follows standard cryptographic primitives and security best practices but must undergo independent review before deployment.*

---


## Repo Structure

```
Rantchit
    |__
    |__ .github/
    |__ .gitignore
    |__ .gitattributes
    |__ .dockerignore
    |__ docker-compose.yaml
    |__ docs/   
    |__ mobile/     
    |__ src/
    |__ infra/ 
    |__ README.md  
    |__ README-Ideate.md 
    |__ SECURITY.md
```

## Project Structure - src/backend

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── redis_client.py
│   ├── security.py
│   ├── websocket_manager.py
│   └── endpoints/
│       ├── __init__.py
│       ├── rooms.py
│       └── ws.py
├── requirements.txt
├── Dockerfile
└── alembic/ (omitted for brevity)
```


## Project Structure - src/Frontend

```
frontend/
├── src/
│   ├── lib/
│   │   ├── crypto.ts
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   ├── sas.ts
│   │   └── types.ts
│   ├── hooks/
│   │   ├── useRoom.ts
│   │   └── useCrypto.ts
│   ├── components/
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   ├── RoomHeader.tsx
│   │   ├── VerificationModal.tsx
│   │   └── ConnectionStatus.tsx
│   ├── pages/
│   │   ├── HomeScreen.tsx
│   │   └── RoomScreen.tsx
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── index.html
```

