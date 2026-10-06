# Hookscope — Design Direction

## Identitas visual

Hookscope adalah alat developer: padat, presisi, utilitarian. Bukan produk marketing. Karakter desainnya seperti terminal yang dipoles — bersih secara teknis, tapi terasa handmade. Informasi adalah prioritas pertama; ornamen adalah liabilitas.

Audiens: backend engineer, QA, tim ops. Mereka membaca teks kecil, familiar dengan JSON dan CLI, dan tidak butuh diarahkan dengan warna mencolok.

## Bahasa UI

Seluruh teks UI menggunakan **Bahasa Indonesia** (konsisten di semua halaman dan komponen).

## Tema

- Dark sebagai tampilan utama.
- Light mode tersedia, mengikuti `prefers-color-scheme` dan dapat di-toggle manual.
- Toggle disimpan di `localStorage` (key: `hookscope-theme`).

## Tipografi

| Peran | Font | Catatan |
|---|---|---|
| UI (label, tombol, teks) | **IBM Plex Sans** | Bersih, terasa engineering, bukan generik |
| Kode, URL, header, JSON | **IBM Plex Mono** | Satu keluarga, konsistensi visual |

**Fallback stack**: `'IBM Plex Sans', system-ui, -apple-system, sans-serif` dan `'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace`.

**Alasan pilihan**: IBM Plex dirancang oleh IBM untuk konteks teknis dan developer tools. Satu keluarga untuk sans dan mono menghasilkan harmoni visual tanpa perlu menyeimbangkan dua keluarga berbeda. Tidak termasuk dalam daftar "default AI" (bukan Inter, bukan Roboto).

**Scale**: 11px / 13px / 14px / 16px / 20px / 24px / 32px. Line-height 1.5 untuk teks prosa, 1.4 untuk UI pendek.

## Warna

Palet didefinisikan sebagai CSS variables. Tidak ada warna hardcode di komponen.

### Dark mode (default)

| Token | Nilai | Fungsi |
|---|---|---|
| `--bg` | `#0c0e14` | Background utama |
| `--surface` | `#13151f` | Card, panel |
| `--surface-2` | `#1a1d2b` | Nested surface, input |
| `--border` | `rgba(255,255,255,0.08)` | Border halus |
| `--text` | `#e4e6f0` | Teks utama |
| `--text-muted` | `#7a7f96` | Teks sekunder |
| `--accent` | `#4f7dff` | Aksen biru elektrik |
| `--accent-dim` | `rgba(79,125,255,0.15)` | Highlight ringan |
| `--success` | `#3ecf8e` | Sukses / valid |
| `--warning` | `#f0b429` | Peringatan |
| `--danger` | `#f75a5a` | Error / invalid |

### Light mode

| Token | Nilai | Fungsi |
|---|---|---|
| `--bg` | `#f5f6fa` | Background |
| `--surface` | `#ffffff` | Card |
| `--surface-2` | `#eef0f7` | Input, nested |
| `--border` | `rgba(0,0,0,0.09)` | Border |
| `--text` | `#1a1d2b` | Teks utama |
| `--text-muted` | `#6b7080` | Teks sekunder |
| `--accent` | `#2d63e8` | Aksen biru |
| `--accent-dim` | `rgba(45,99,232,0.12)` | Highlight ringan |
| `--success` | `#1e9a6a` | |
| `--warning` | `#c47d0e` | |
| `--danger` | `#d43939` | |

### Badge method

| Method | Token |
|---|---|
| GET | `--method-get: #3ecf8e` |
| POST | `--method-post: #4f7dff` |
| PUT | `--method-put: #f0b429` |
| PATCH | `--method-patch: #a78bfa` |
| DELETE | `--method-delete: #f75a5a` |
| HEAD | `--method-head: #7a7f96` |
| OPTIONS | `--method-options: #7a7f96` |

Badge WAJIB memuat teks method (bukan hanya warna).

## Layout

- **Desktop** (>= 768px): dua panel grid `320px 1fr`.
- **Mobile** (< 768px): satu kolom, min-width 360px.

## Gerak

- Highlight singkat 300ms saat request baru masuk.
- Transisi tema 200ms.
- Tidak ada animasi masuk per section.
- Semua transisi dihormati `prefers-reduced-motion`.

## Aksesibilitas

- Semua elemen interaktif bisa dipakai keyboard + focus visible.
- Daftar request live pakai `aria-live="polite"`.
- Badge method punya teks, bukan hanya warna.
- Tombol ikon-saja punya `aria-label`.
- Input form punya label, pesan error inline, tombol copy beri umpan balik "Tersalin".
