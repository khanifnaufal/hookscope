/**
 * Dashboard — main view after creating an endpoint.
 * Shows: hook URL + copy button, expiry countdown, live request list via SSE,
 * live indicator, empty state with curl example.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Webhook, ArrowLeft, Sun, Moon, Trash2 } from 'lucide-react';
import { getEndpoint, listRequests, type RequestItem, type EndpointInfo } from '../lib/api';
import { connectSSE, type SSEStatus } from '../lib/sse';
import { useTheme } from '../components/ThemeProvider';
import { CopyButton } from '../components/CopyButton';
import { LiveIndicator } from '../components/LiveIndicator';
import { RequestRow } from '../components/RequestRow';
import { formatCountdown } from '../lib/format';

interface DashboardProps {
  endpointId: string;
  manageToken: string;
  hookUrl: string;
  expiresAt: string;
  onBack: () => void;
}

export default function Dashboard({
  endpointId,
  manageToken: _token,
  hookUrl,
  expiresAt: initialExpiresAt,
  onBack,
}: DashboardProps) {
  const { theme, toggle } = useTheme();
  const [endpoint, setEndpoint] = useState<EndpointInfo | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sseStatus, setSseStatus] = useState<SSEStatus>('connecting');
  const [countdown, setCountdown] = useState(() => formatCountdown(initialExpiresAt));
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(formatCountdown(endpoint?.expires_at ?? initialExpiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [endpoint?.expires_at, initialExpiresAt]);

  // Load endpoint info
  useEffect(() => {
    getEndpoint(endpointId)
      .then(setEndpoint)
      .catch((e: Error) => setEndpointError(e.message));
  }, [endpointId]);

  // Load initial requests
  useEffect(() => {
    setLoadingRequests(true);
    listRequests(endpointId, { limit: 50 })
      .then((result) => {
        setRequests(result.items);
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false));
  }, [endpointId]);

  // SSE live stream
  const lastEventIdRef = useRef<string | undefined>(undefined);

  const handleNewRequest = useCallback((req: RequestItem) => {
    setRequests((prev) => {
      // Avoid duplicates
      if (prev.some((r) => r.id === req.id)) return prev;
      return [req, ...prev];
    });
    setNewIds((prev) => new Set(prev).add(req.id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(req.id);
        return next;
      });
    }, 1000);
    lastEventIdRef.current = String(req.id);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(`hookscope-token-${endpointId}`) ?? '';
    const client = connectSSE(endpointId, token, handleNewRequest, setSseStatus);
    return () => client.close();
  }, [endpointId, handleNewRequest]);

  const selectedRequest = requests.find((r) => r.id === selectedId) ?? null;

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* ─── Header ─── */}
      <header
        className="flex flex-shrink-0 items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <button
          type="button"
          className="btn-icon"
          onClick={onBack}
          aria-label="Kembali ke halaman utama"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>

        <Webhook size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
        <span className="font-mono text-sm font-medium tracking-tight">Hookscope</span>

        <span
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: 'var(--border)' }}
          aria-hidden="true"
        />

        {/* Hook URL */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <code
            className="min-w-0 flex-1 truncate font-mono text-xs"
            style={{ color: 'var(--text-muted)' }}
            title={hookUrl}
          >
            {hookUrl}
          </code>
          <CopyButton text={hookUrl} label="Salin URL" />
        </div>

        {/* Expiry */}
        <div
          className="hidden items-center gap-1 text-xs sm:flex"
          style={{ color: 'var(--text-muted)' }}
          aria-label={`Aktif selama ${countdown}`}
        >
          <span>Kadaluarsa:</span>
          <span className="font-mono" style={{ color: 'var(--warning)' }}>
            {countdown}
          </span>
        </div>

        <LiveIndicator status={sseStatus} />

        <button
          type="button"
          onClick={toggle}
          className="btn-icon ml-1"
          aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
        >
          {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
      </header>

      {endpointError && (
        <div className="px-4 py-2 text-sm" style={{ color: 'var(--danger)', backgroundColor: 'var(--surface)' }} role="alert">
          {endpointError}
        </div>
      )}

      {/* ─── Body ─── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left panel — request list */}
        <aside
          className="flex w-80 flex-shrink-0 flex-col border-r"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Request masuk
            </h2>
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              {requests.length}
            </span>
          </div>

          {/* Scrollable request list */}
          <div
            className="min-h-0 flex-1 overflow-y-auto p-2"
            role="list"
            aria-label="Daftar request masuk"
            aria-live="polite"
          >
            {loadingRequests ? (
              /* Loading skeleton */
              <div className="space-y-2 p-2" aria-busy="true" aria-label="Memuat request…">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg"
                    style={{ backgroundColor: 'var(--surface-2)' }}
                  />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <EmptyState hookUrl={hookUrl} />
            ) : (
              <div className="space-y-0.5">
                {requests.map((req) => (
                  <div key={req.id} role="listitem">
                    <RequestRow
                      request={req}
                      isSelected={req.id === selectedId}
                      isNew={newIds.has(req.id)}
                      onClick={() => setSelectedId(req.id === selectedId ? null : req.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right panel — request detail */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {selectedRequest ? (
            <RequestDetail request={selectedRequest} endpointId={endpointId} onDelete={() => {
              setRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id));
              setSelectedId(null);
            }} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Pilih request dari daftar untuk melihat detail
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ hookUrl }: { hookUrl: string }) {
  const curlExample = `curl -X POST ${hookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"event": "test", "data": "hello"}'`;

  return (
    <div className="p-4 text-center">
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Belum ada request. Coba kirim satu:
      </p>
      <div
        className="rounded-lg p-3 text-left"
        style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Contoh curl
          </span>
          <CopyButton text={curlExample} label="Salin" />
        </div>
        <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text)' }}>
          {curlExample}
        </pre>
      </div>
    </div>
  );
}

/* ─── Request Detail (minimal for Phase 5, expanded in Phase 6) ─── */
interface RequestDetailProps {
  request: RequestItem;
  endpointId: string;
  onDelete: () => void;
}

function RequestDetail({ request, endpointId: _eid, onDelete }: RequestDetailProps) {
  const formatBody = () => {
    if (!request.body) return null;
    try {
      return JSON.stringify(JSON.parse(request.body), null, 2);
    } catch {
      return request.body;
    }
  };

  const prettyBody = formatBody();

  return (
    <div className="p-6">
      {/* Header row */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="font-mono text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5"
              style={{
                backgroundColor: `color-mix(in srgb, var(--method-${request.method.toLowerCase()}) 20%, transparent)`,
                color: `var(--method-${request.method.toLowerCase()})`,
              }}
            >
              {request.method}
            </span>
            <code className="font-mono text-sm" style={{ color: 'var(--text)' }}>
              {request.path}
            </code>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {new Date(request.received_at).toLocaleString('id-ID')} &middot; {request.ip ?? '–'} &middot; {request.size_bytes} B
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
          onClick={onDelete}
          aria-label="Hapus request ini"
        >
          <Trash2 size={13} aria-hidden="true" />
          Hapus
        </button>
      </div>

      {/* Headers */}
      <section className="mb-4">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Headers
        </h3>
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {Object.entries(request.headers as Record<string, string>).map(([k, v]) => (
            <div key={k} className="flex gap-2 font-mono text-[11px]">
              <span className="flex-shrink-0" style={{ color: 'var(--accent)' }}>{k}:</span>
              <span className="min-w-0 break-all" style={{ color: 'var(--text)' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Body */}
      {prettyBody && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Body
            </h3>
            <CopyButton text={prettyBody} label="Salin body" />
          </div>
          <pre
            className="overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed"
            style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {prettyBody}
          </pre>
        </section>
      )}
    </div>
  );
}
