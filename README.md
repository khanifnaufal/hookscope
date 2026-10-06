# Hookscope

> **Real-time webhook inspector** — Capture, inspect, and debug HTTP requests instantly.

Hookscope memberi kamu URL unik untuk menangkap HTTP request masuk (method, headers, query, body, IP, timestamp) dan menampilkannya secara real-time di dashboard. Berguna untuk debugging webhook dari payment gateway, GitHub, Slack, dan layanan lainnya — tanpa harus membuat server sendiri.

---

## ✨ Fitur

- 🔗 **URL Unik** — Buat endpoint instan dengan ID acak
- ⚡ **Real-time** — Request baru muncul langsung via Server-Sent Events (SSE)
- 🔍 **Inspeksi Detail** — Headers, body (JSON pretty-print), query params, IP
- 🔐 **Verifikasi HMAC** — Cek signature SHA-256/SHA-1 secara otomatis
- 🎛️ **Custom Response** — Atur status code, body, delay (simulasi error)
- 🔄 **Replay** — Kirim ulang request tersimpan ke URL tujuan
- 📋 **Copy as cURL** — Salin request sebagai perintah curl langsung
- 🧹 **Auto-cleanup** — Data dihapus otomatis setelah 7 hari

---

## 🚀 Cara Jalan Lokal

### Prasyarat

- Node.js 20+
- npm 10+

### Setup

```bash
# Clone repo
git clone <repo-url>
cd hookscope

# Install semua dependency
npm install

# Buat file .env dari contoh
cp .env.example .env

# Jalankan server dan web secara paralel
npm run dev:server   # terminal 1 — http://localhost:3000
npm run dev:web      # terminal 2 — http://localhost:5173
```

---

## 🏗️ Arsitektur

```
hookscope/
  server/   — Fastify API + SSE + DB (LibSQL/Turso)
  web/      — React + Vite + Tailwind dashboard
  docs/     — ARCHITECTURE.md, DECISIONS.md
```

Lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk detail lebih lanjut.

---


## 🛡️ Keamanan

- Semua isi request di-escape di UI (tidak ada `dangerouslySetInnerHTML`)
- Secret HMAC tidak pernah dikirim balik utuh ke klien
- Endpoint bersifat publik — **jangan gunakan data produksi yang sensitif**

---

## 📋 Status Build

| Fase | Status | Deskripsi |
|------|--------|-----------|
| 0 | ✅ | Setup monorepo, Fastify hello, Vite React, CI |
| 1 | 🔜 | Database dan pembuatan endpoint |
| 2 | 🔜 | Penangkap webhook |
| 3 | 🔜 | API baca dan hapus request |
| 4 | 🔜 | Real-time SSE |
| 5 | 🔜 | Frontend dasar |
| 6 | 🔜 | Detail request di UI |
| 7 | 🔜 | Custom response dan HMAC |
| 8 | 🔜 | Hardening |
| 9 | 🔜 | Replay dengan proteksi SSRF |
| 10 | 🔜 | Test, deploy, dokumentasi |

---

## 📝 Changelog

Lihat [`CHANGELOG.md`](CHANGELOG.md).
