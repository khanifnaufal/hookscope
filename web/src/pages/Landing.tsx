/**
 * Landing page — entry point when no endpoint is active.
 * Allows user to create a new endpoint or restore from localStorage.
 */
import { useState } from 'react';
import { Webhook, ShieldAlert, Plus, Clock } from 'lucide-react';
import { createEndpoint } from '../lib/api';
import { useTheme } from '../components/ThemeProvider';
import { Sun, Moon } from 'lucide-react';

interface LandingProps {
  onEndpointCreated: (id: string, token: string, hookUrl: string, expiresAt: string) => void;
}

export default function Landing({ onEndpointCreated }: LandingProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggle } = useTheme();

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createEndpoint();
      onEndpointCreated(result.id, result.manage_token, result.hook_url, result.expires_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Topbar */}
      <header className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Webhook size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <span className="font-mono text-sm font-medium tracking-tight">Hookscope</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="btn-icon"
          aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
        >
          {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
        </button>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          {/* Logo area */}
          <div className="mb-10 text-center">
            <div
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'var(--accent-dim)', border: '1px solid var(--border)' }}
            >
              <Webhook size={32} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight" style={{ textWrap: 'balance' } as React.CSSProperties}>
              Inspeksi webhook secara real-time
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Dapatkan URL unik untuk menangkap HTTP request masuk. Lihat header, body, dan metadata
              langsung di dashboard — tanpa perlu server.
            </p>
          </div>

          {/* Create button */}
          <div className="text-center">
            <button
              id="btn-create-endpoint"
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-base"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
              Membuat…
                </>
              ) : (
                <>
                  <Plus size={18} aria-hidden="true" />
                  Buat endpoint baru
                </>
              )}
            </button>

            {error && (
              <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }} role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Warning notice */}
          <div
            className="mt-10 flex gap-3 rounded-xl p-4 text-sm"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            role="note"
          >
            <ShieldAlert
              size={16}
              className="mt-0.5 flex-shrink-0"
              style={{ color: 'var(--warning)' }}
              aria-hidden="true"
            />
            <p style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>Endpoint bersifat publik.</strong>{' '}
              Siapa pun yang memiliki URL dapat mengirim request. Jangan gunakan data produksi atau
              informasi sensitif.
            </p>
          </div>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            <div className="flex flex-col items-center gap-1.5">
              <Clock size={14} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span>Aktif selama 7 hari</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Webhook size={14} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span>Semua metode HTTP</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <ShieldAlert size={14} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              <span>Verifikasi HMAC</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
