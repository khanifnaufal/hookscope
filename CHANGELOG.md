# Changelog

All notable changes to Hookscope will be documented in this file.

Format: [Conventional Commits](https://www.conventionalcommits.org/)

---

## [Unreleased]

### Phase 8 — Hardening

- `feat: ttl cleanup job` — layanan `cleanup.ts` yang berjalan setiap 10 menit untuk menghapus endpoint kedaluwarsa beserta seluruh request-nya (via `ON DELETE CASCADE`); job dimulai otomatis saat server boot dan menggunakan `timer.unref()` agar tidak mencegah proses berhenti; dapat dihentikan dengan `stopCleanupJob()` (berguna di test).
- `feat: rate limiting` — `SlidingWindowRateLimiter` berbasis in-memory sliding-window: (1) **60 request/menit per endpoint ID** pada `/hook/:id` — melebihi batas mengembalikan `429` dengan header `Retry-After: 60`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`; (2) **10 pembuatan endpoint/jam per IP klien** pada `POST /api/endpoints` — melebihi batas mengembalikan `429` dengan header `Retry-After: 3600`; setiap request yang berhasil menyertakan header `X-RateLimit-Remaining` sisa.
- `feat: structured JSON logging in production` — Fastify logger dikonfigurasi ulang: mode dev tetap memakai `pino-pretty` berwarna; mode production menghasilkan log JSON terstruktur dengan serializer request/response standar; mode test logging dimatikan sepenuhnya (`false`) agar output test bersih.
- `feat: CORS restricted to ALLOWED_ORIGINS` — rute `/api/*` membaca variabel `ALLOWED_ORIGINS` (comma-separated), jika tidak diset memperbolehkan semua origin (cocok untuk dev lokal); rute `/hook/:id` sengaja tidak diberi CORS karena bersifat publik dan menerima request dari semua sumber; `.env.example` diperbarui dengan dokumentasi variabel baru.
- `feat: normalise duplicate headers` — nilai header duplikat (array, misal dua `Cookie`) digabung menjadi satu string dengan `, ` sebelum disimpan ke DB, sehingga JSON header selalu merupakan `Record<string, string>`.
- `test: edge cases` — 16 test baru di `hardening.test.ts` mencakup: TTL cleanup (hapus expired/cascade/pertahankan yang valid), unit test `SlidingWindowRateLimiter` (allow/block/remaining/key isolation), integrasi HTTP 429 pada hook dan endpoint creation, body kosong (GET), body biner (PNG disimpan base64), header duplikat ternormalisasi, body besar ≤1 MB diterima, body >1 MB dikembalikan 413.

### Phase 7 — Custom Response dan HMAC

- `feat(api): custom response config` — rute `PATCH /api/endpoints/:id` dilindungi Bearer token untuk mengubah pengaturan respons otomatis (`response_status` 100–599, `response_body` hingga 100 KB, `response_content_type`, `response_delay_ms` hingga 10.000 ms) dan konfigurasi verifikasi HMAC (`hmac_secret`, `hmac_algo`, `hmac_header`); validasi skema ketat menggunakan Zod; HMAC secret tetap di-mask (`***`) pada respons.
- `feat(hmac): verify signatures` — layanan `verifyWebhookSignature` dengan perbandingan konstan waktu (`crypto.timingSafeEqual`) untuk mencegah serangan timing/side-channel; dukungan hash SHA-256 dan SHA-1; penanganan otomatis prefix format signature (`sha256=`, `sha1=`), raw hex (case-insensitive), dan base64; integrasi penuh pada penangkap webhook `/hook/:id` dengan penyimpanan status verifikasi ke basis data dan siaran real-time SSE (`signature_valid`: `true`, `false`, atau `null` jika tidak ada header signature).
- `feat(web): settings modal and signature tab` — modal Pengaturan endpoint dengan form kustom response dan form konfigurasi HMAC; tab "Signature" pada panel detail request dengan kartu status bertenaga ikon + teks (Valid, Tidak Valid, Tidak Ada Signature), tabel header signature yang terdeteksi, nilai mentah signature dengan tombol salin, dan panduan teknis verifikasi; tombol buka pengaturan pada header dashboard.
- `fix(web): modal accessibility` — dialog modal aksesibel penuh (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`); focus trap dengan keyboard Tab / Shift+Tab; penutupan dialog dengan tombol Escape dan klik backdrop; pemulihan fokus otomatis ke elemen pemicu saat dialog tertutup; validasi form inline dengan `aria-invalid` dan `aria-describedby` ke pesan error; tombol aksi dengan spinner loading `"Menyimpan…"`.
- `test: custom response, hmac, and settings validation` — unit test Vitest komprehensif mencakup operasi PATCH endpoint, penolakan input invalid (400), penolakan tanpa token (401), perbandingan timing-safe, verifikasi signature SHA-256/SHA-1/prefix/raw/base64, pemetaan status signature UI, dan validasi form pengaturan.

### Phase 6 — Detail Request di UI

- `feat(web): request detail tabs and curl copy` — panel detail dengan tab Body (JSON pretty-print monospace, raw text fallback, empty state), Headers (tabel key-value, hitungan badge, filter pencarian), dan Query (tabel query params); tombol salin cURL siap pakai dengan `generateCurl` (skip hop-by-hop headers, bash-escaped quotes); tombol salin body; rendering teks strictly safe tanpa HTML/XSS execution; scrolling internal pada boks body panjang.
- `feat(web): filter and search for requests` — filter badge/pill metode HTTP (Semua, GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS); kolom input pencarian dengan debounce 250 ms untuk path, IP, dan isi body; filter realtime terintegrasi dengan event SSE; state kosong khusus jika pencarian/filter tidak menghasilkan kecocokan beserta tombol reset.
- `feat(web): delete single request and confirm dialog for delete all` — tombol hapus individual untuk request yang dipilih; tombol "Hapus semua" dengan modal konfirmasi dialog aksesibel (`role="alertdialog"`, `aria-modal="true"`, focus trap, tombol Escape, pengembalian fokus ke elemen pemicu).
- `fix(web): keyboard and aria improvements` — navigasi tab sesuai standar W3C ARIA Tablist (dukungan ArrowLeft, ArrowRight, Home, End dengan fokus otomatis); responsive layout adaptif (desktop 2-panel, mobile single-column dengan tombol navigasi kembali); audit Web Interface Guidelines (focus-visible ring, tabular-nums, `…` ellipsis).
- `test(web): add unit tests for curl, detail, and escaping` — 16 unit test Vitest mencakup pembentukan cURL, escaping kutip tunggal, parsing header, formatting JSON pretty, XSS safety pada payload tag `<script>`, filter matching, dan keyboard tab cycling.

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
