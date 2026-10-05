# Architecture

## Overview

Hookscope adalah monorepo yang terdiri dari dua workspace:

```
hookscope/
  server/   — Node.js 20 + TypeScript + Fastify
  web/      — React 18 + Vite + TypeScript + Tailwind
```

## Request Flow

```
User (browser)
  │
  ├─► Web (Vite/React :5173)  ←──── SSE stream ──────┐
  │       │ proxy /api, /hook                          │
  │       ▼                                            │
  └─► Server (Fastify :3000)                           │
          │                                            │
          ├─► POST /api/endpoints  ──► DB (LibSQL)     │
          ├─► ALL  /hook/:id       ──► DB + SSE push ──┘
          ├─► GET  /api/*/requests ──► DB
          └─► GET  /api/*/stream   ──► SSE connection
```

## Stack Rationale

| Layer | Pilihan | Alasan |
|---|---|---|
| Runtime | Node.js 20 + TypeScript | Ekosistem luas, type-safe |
| Backend | Fastify | Performan, low overhead, plugin ecosystem |
| Database | LibSQL (@libsql/client) | SQLite lokal + Turso cloud seamless |
| Real-time | SSE (Server-Sent Events) | Simpler dari WebSocket untuk push-only stream |
| Frontend | React + Vite + Tailwind | Cepat, ekosistem besar |

## Database Schema

Lihat `server/src/db/schema.sql` (tersedia mulai Fase 1).

## Security Considerations

- Endpoint ID: nanoid 12 karakter (acak, tidak berurutan)
- Dashboard dilindungi `manage_token` (tidak disimpan di server, hanya hash)
- Secret HMAC tidak pernah dikembalikan utuh ke klien
- Semua input dari webhook di-escape saat ditampilkan di UI
