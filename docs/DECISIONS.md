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
