# Changelog

All notable changes to Hookscope will be documented in this file.

Format: [Conventional Commits](https://www.conventionalcommits.org/)

---

## [Unreleased]

### Phase 5 — Frontend Dasar

- `docs: add design direction` — `docs/DESIGN.md` memuat arah visual (IBM Plex Sans/Mono, palet token dark/light, badge method, layout dua panel, gerak, aksesibilitas).
- `feat(web): design tokens and theme` — CSS variables lengkap untuk dark dan light mode; IBM Plex Sans/Mono menggantikan Inter/JetBrains; komponen `.card`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`, `.input`, `.code-block`, `.method-badge`, `.live-dot`, `.flash-new`; toggle tema disimpan di `localStorage`; `prefers-reduced-motion` dihormati; focus ring `focus-visible` di semua elemen interaktif.
- `feat(web): landing page` — halaman utama dengan tombol "Buat endpoint baru", peringatan endpoint publik, fitur highlights; UI Bahasa Indonesia; animasi loading spinner; pesan error inline.
- `feat(web): dashboard layout` — header dengan URL + tombol salin + countdown kadaluarsa + `LiveIndicator`; dua panel grid (daftar kiri 320 px, detail kanan); hash-based routing `/#/<id>`; token dan endpoint disimpan di `localStorage`.
- `feat(web): live request list` — `RequestRow` dengan badge method, path terpotong, waktu relatif, ukuran; `aria-live="polite"` pada daftar; flash highlight 800 ms saat request baru; SSE client dengan auto-reconnect dan `Last-Event-ID`; empty state dengan contoh curl siap salin; loading skeleton.
- `fix(web): address design guideline findings` — ganti `div[role=button]` → `<button>`; ganti `focus:outline-none` → `focus-visible` ring; ellipsis karakter `…`; `text-wrap: balance` pada heading; `aria-label` pada semua ikon tombol.

### Phase 4 — Real-time SSE

- `feat(sse): stream new requests` — implementasi `SseService` dan rute `GET /api/endpoints/:id/stream` untuk streaming request masuk secara real-time via Server-Sent Events; integrasi siaran broadcast dari handler webhook `hook.ts`; dukungan autentikasi token via header `Authorization: Bearer` maupun query parameter `?token=`.
- `feat(sse): heartbeat and resume support` — heartbeat berkala 15 detik (`: ping\n\n`), header `X-Accel-Buffering: no` untuk mencegah buffering proxy/nginx, dan pemutaran ulang request yang terlewat (`Last-Event-ID` header atau `?last_event_id=`) saat koneksi reconnect.
- `test: sse stream and reconnection` — 7 test suite Vitest mencakup autentikasi token (header dan query), validasi header SSE, live push event saat webhook baru masuk, heartbeat comment, dan pemutaran ulang missed requests dengan `Last-Event-ID`.

### Phase 3 — API Baca dan Hapus Request

- `feat(api): list and detail requests` — rute `GET /api/endpoints/:id/requests` (pagination dengan `limit` & `offset`, filter `method`, search pada body/path/query, parsing query & headers ke JSON object) dan `GET /api/endpoints/:id/requests/:rid` (detail satu request, 404 jika tidak ditemukan).
- `feat(api): delete requests` — rute `DELETE /api/endpoints/:id/requests/:rid` (hapus satu request), `DELETE /api/endpoints/:id/requests` (hapus semua request pada endpoint), dan `DELETE /api/endpoints/:id` (hapus endpoint beserta seluruh request terkait).
- `feat: cap 500 requests per endpoint` — penerapan batas FIFO maksimal 500 request per endpoint pada saat webhook baru masuk dengan membuang request yang paling lama.
- `test: request management and fifo cap` — 11 test kasus Vitest untuk list requests, pagination, filter method, text search, detail request, delete single/all, cascade delete endpoint, dan verifikasi limit 500 FIFO pruning.

### Phase 2 — Penangkap Webhook

- `feat(hook): capture all http methods` — handler `ALL /hook/:id` dan `/hook/:id/*` untuk GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS; simpan method, path, query, headers, body, content-type, IP, size_bytes, dan received_at ke database; cek keberadaan dan masa aktif endpoint (return 404 jika tidak ada atau expired); dukung custom status, body, content-type, dan delay.
- `feat(hook): enforce 1mb limit` — batasi ukuran body maksimal 1 MB (1048576 byte) menggunakan Fastify `bodyLimit`, return status 413 Payload Too Large tanpa menyimpan request ke DB; dukung parsing payload biner menjadi base64.
- `test: hook capture` — 9 test suite Vitest untuk capture seluruh HTTP methods, query params, subpaths, binary payload (base64), 404 endpoint not found/expired, 413 payload too large, serta custom responses.

### Phase 1 — Database dan Pembuatan Endpoint

- `feat(db): add libsql client and schema migration` — `schema.sql` (endpoints + requests + index), auto-migrate saat start dengan `:memory:` fallback untuk test
- `feat(api): bearer token auth middleware` — `requireManageToken` preHandler, return 401 tanpa/salah token
- `feat(api): POST /api/endpoints and GET /api/endpoints/:id` — buat endpoint (nanoid 12), return `id`, `manage_token`, `hook_url`, `expires_at`; GET endpoint dengan HMAC secret di-mask
- `test: endpoint creation and bearer token auth` — 5 test kasus: create, get valid, get tanpa token, get token salah, mask secret

### Phase 0 — Setup

- `chore: init monorepo` — root package.json dengan npm workspaces
- `chore: setup server` — Fastify + TypeScript + Vitest + ESLint + Prettier
- `chore: setup web` — Vite + React + TypeScript + Tailwind CSS
- `ci: add github actions workflow` — lint + test pada push/PR
- `docs: add readme skeleton` — README dengan fitur, setup, arsitektur
