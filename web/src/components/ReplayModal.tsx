import { useState, useEffect, useRef } from 'react';
import {
  RotateCw,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Loader2,
  Code,
  ListFilter,
} from 'lucide-react';
import type { RequestItem, ReplayResult } from '../lib/api';
import { replayRequest } from '../lib/api';
import { CopyButton } from './CopyButton';

interface ReplayModalProps {
  request: RequestItem;
  isOpen: boolean;
  onClose: () => void;
}

export function ReplayModal({ request, isOpen, onClose }: ReplayModalProps) {
  const [targetUrl, setTargetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, request.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await replayRequest(request.endpoint_id, request.id, targetUrl.trim());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replay-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-xl border flex flex-col max-h-[90vh] shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <RotateCw size={16} />
            </div>
            <div>
              <h2 id="replay-modal-title" className="text-sm font-semibold">
                Replay Request #{request.id}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Kirim ulang webhook ini ke URL target publik dengan proteksi SSRF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label="Tutup modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form & Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="target-url-input"
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text)' }}
              >
                Target URL (Publik HTTP/HTTPS)
              </label>
              <div className="flex gap-2">
                <input
                  id="target-url-input"
                  ref={inputRef}
                  type="url"
                  required
                  placeholder="https://httpbin.org/post"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-xs font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--surface-sunken)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !targetUrl.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Mengirim...</span>
                    </>
                  ) : (
                    <>
                      <RotateCw size={13} />
                      <span>Kirim</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* SSRF Protection Notice */}
            <div
              className="flex items-start gap-2 rounded-lg p-2.5 text-xs"
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.08)',
                borderColor: 'rgba(234, 179, 8, 0.25)',
                borderWidth: 1,
                color: '#eab308',
              }}
            >
              <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                <strong className="text-[#eab308]">Proteksi SSRF Aktif:</strong> Permintaan ke
                localhost, IP privat (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
                169.254.0.0/16), serta redirect terlarang akan diblokir otomatis demi keamanan.
              </p>
            </div>
          </form>

          {/* Error Message */}
          {error && (
            <div
              className="flex items-start gap-2.5 rounded-lg border p-3 text-xs animate-shake"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: 'var(--danger)',
              }}
            >
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-0.5">Replay Gagal</div>
                <div className="opacity-90">{error}</div>
              </div>
            </div>
          )}

          {/* Result Section */}
          {result && (
            <div
              className="rounded-xl border overflow-hidden mt-4"
              style={{
                backgroundColor: 'var(--surface-sunken)',
                borderColor: 'var(--border)',
              }}
            >
              {/* Result summary header */}
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      result.status >= 200 && result.status < 300
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {result.status >= 200 && result.status < 300 ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <AlertCircle size={12} />
                    )}
                    <span>
                      {result.status} {result.status_text}
                    </span>
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-mono truncate max-w-[300px]">
                    {result.target_url}
                  </span>
                </div>
                {result.body && (
                  <CopyButton
                    text={result.body}
                    label="Salin Response"
                    aria-label="Salin isi response"
                  />
                )}
              </div>

              {/* Result Tabs */}
              <div
                className="flex border-b px-3 text-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('body')}
                  className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
                    activeTab === 'body'
                      ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Code size={13} />
                  <span>Response Body</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('headers')}
                  className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
                    activeTab === 'headers'
                      ? 'border-[var(--accent)] text-[var(--text)] font-semibold'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <ListFilter size={13} />
                  <span>Headers ({Object.keys(result.headers || {}).length})</span>
                </button>
              </div>

              {/* Tab content */}
              <div className="p-3 text-xs font-mono max-h-60 overflow-y-auto">
                {activeTab === 'body' ? (
                  result.body ? (
                    <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
                      {result.body}
                    </pre>
                  ) : (
                    <p className="text-[var(--text-muted)] italic">Response body kosong</p>
                  )
                ) : (
                  <div className="space-y-1">
                    {Object.entries(result.headers || {}).map(([key, val]) => (
                      <div key={key} className="flex gap-2">
                        <span className="text-[var(--accent)] font-semibold">{key}:</span>
                        <span className="text-[var(--text-muted)] break-all">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end px-5 py-3 border-t bg-[var(--surface)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-1.5 text-xs font-medium hover:bg-[var(--surface-hover)] transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
