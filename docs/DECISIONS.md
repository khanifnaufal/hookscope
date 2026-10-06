# Decision Log

Setiap keputusan arsitektur atau teknis yang non-trivial dicatat di sini.

---

## [DECISION-001] Database lokal untuk dev, Turso untuk production

**Tanggal**: 2026-10-05  
**Status**: Accepted

**Konteks**: Perlu DB yang gratis dan mudah di-setup lokal.

**Keputusan**: Gunakan `@libsql/client` dengan `file:./data/local.db` untuk dev. Saat deploy ke Render, ganti `DATABASE_URL` ke Turso URL dan set `TURSO_AUTH_TOKEN`.

**Konsekuensi**: Tidak perlu Docker untuk dev. Migration SQL harus kompatibel dengan SQLite syntax.

---

## [DECISION-002] SSE bukan WebSocket untuk real-time

**Tanggal**: 2026-10-05  
**Status**: Accepted

**Konteks**: Perlu push real-time dari server ke browser saat ada request masuk.

**Keputusan**: Gunakan Server-Sent Events (SSE). Browser reconnect otomatis dan mendukung `Last-Event-ID` untuk resume.

**Konsekuensi**: Komunikasi hanya satu arah (server → client). Cukup untuk use case ini karena browser tidak perlu mengirim data via stream.

---

## [DECISION-003] Vitest forks pool dan ESLint setup di workspace web

**Tanggal**: 2026-10-06  
**Status**: Accepted

**Konteks**: 
1. Saat menjalankan Vitest di Windows dengan `@libsql/client` (native addon), thread worker default vitest mengalami access violation (exit code 3221225477) saat proses selesai.
2. Workspace `web` belum memiliki `.eslintrc.cjs` sehingga `npm run lint --workspace=web` gagal.

**Keputusan**: 
1. Gunakan `pool: 'forks'` di `server/vitest.config.ts` untuk isolasi proses yang aman bagi native SQLite binary di Windows.
2. Tambahkan `web/.eslintrc.cjs` dengan konfigurasi typescript dan react-hooks.

**Konsekuensi**: CI dan lokal test serta lint berjalan hijau dan stabil di lingkungan Windows maupun Linux.
