/**
 * Dashboard — main view after creating an endpoint.
 * Features:
 * - Live request list via SSE with method filtering and search
 * - Comprehensive RequestDetail panel with Headers, Body, and Query tabs
 * - Delete single request & Delete all requests with confirmation modal
 * - Copy cURL command and copy body
 * - Mobile responsive two-panel / single-column layout
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Webhook,
  ArrowLeft,
  Sun,
  Moon,
  Trash2,
  Search,
  X,
  Filter,
  Settings,
} from 'lucide-react';
import {
  getEndpoint,
  updateEndpoint,
  listRequests,
  deleteRequest,
  deleteAllRequests,
  type RequestItem,
  type EndpointInfo,
  type UpdateEndpointInput,
} from '../lib/api';
import { connectSSE, type SSEStatus } from '../lib/sse';
import { useTheme } from '../components/ThemeProvider';
import { CopyButton } from '../components/CopyButton';
import { LiveIndicator } from '../components/LiveIndicator';
import { RequestRow } from '../components/RequestRow';
import { RequestDetail } from '../components/RequestDetail';
import { ConfirmModal } from '../components/ConfirmModal';
import { SettingsModal } from '../components/SettingsModal';
import { formatCountdown } from '../lib/format';

interface DashboardProps {
  endpointId: string;
  manageToken: string;
  hookUrl: string;
  expiresAt: string;
  onBack: () => void;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

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

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  // Fetch requests from API whenever endpoint, method filter, or debounced search changes
  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const result = await listRequests(endpointId, {
        limit: 50,
        method: filterMethod || undefined,
        search: debouncedSearch || undefined,
      });
      setRequests(result.items);
    } catch {
      // silently handle load error or show toast if needed
    } finally {
      setLoadingRequests(false);
    }
  }, [endpointId, filterMethod, debouncedSearch]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  // SSE live stream handler
  const handleNewRequest = useCallback(
    (req: RequestItem) => {
      // Check if incoming request matches the active method filter
      if (filterMethod && req.method.toUpperCase() !== filterMethod) {
        return;
      }

      // Check if incoming request matches debounced search
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const matchesPath = req.path.toLowerCase().includes(q);
        const matchesIp = (req.ip ?? '').toLowerCase().includes(q);
        const matchesBody = (req.body ?? '').toLowerCase().includes(q);
        if (!matchesPath && !matchesIp && !matchesBody) {
          return;
        }
      }

      setRequests((prev) => {
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
    },
    [filterMethod, debouncedSearch],
  );

  useEffect(() => {
    const token = localStorage.getItem(`hookscope-token-${endpointId}`) ?? '';
    const client = connectSSE(endpointId, token, handleNewRequest, setSseStatus);
    return () => client.close();
  }, [endpointId, handleNewRequest]);

  // Delete a single request
  const handleDeleteSingle = useCallback(
    async (requestId: number) => {
      try {
        await deleteRequest(endpointId, requestId);
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (selectedId === requestId) {
          setSelectedId(null);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Gagal menghapus request');
      }
    },
    [endpointId, selectedId],
  );

  // Delete all requests with confirmation
  const handleConfirmDeleteAll = useCallback(async () => {
    setIsDeletingAll(true);
    try {
      await deleteAllRequests(endpointId);
      setRequests([]);
      setSelectedId(null);
      setShowDeleteAllConfirm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus semua request');
    } finally {
      setIsDeletingAll(false);
    }
  }, [endpointId]);

  const handleSaveSettings = useCallback(
    async (data: UpdateEndpointInput) => {
      const updated = await updateEndpoint(endpointId, data);
      setEndpoint(updated);
    },
    [endpointId],
  );

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const isFilterActive = Boolean(filterMethod || debouncedSearch);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* ─── Top Header ─── */}
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
          <span className="font-mono tabular-nums" style={{ color: 'var(--warning)' }}>
            {countdown}
          </span>
        </div>

        <LiveIndicator status={sseStatus} />

        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="btn-icon ml-1"
          aria-label="Pengaturan endpoint"
          title="Pengaturan endpoint"
        >
          <Settings size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={toggle}
          className="btn-icon"
          aria-label={theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'}
        >
          {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
      </header>

      {endpointError && (
        <div
          className="px-4 py-2 text-sm"
          style={{ color: 'var(--danger)', backgroundColor: 'var(--surface)' }}
          role="alert"
        >
          {endpointError}
        </div>
      )}

      {/* ─── Main Content Panels ─── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Panel: Request List */}
        <aside
          className={`flex w-full flex-col border-r md:w-80 lg:w-96 md:flex-shrink-0 ${
            selectedId !== null ? 'hidden md:flex' : 'flex'
          }`}
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          {/* List Header & Delete All */}
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Request masuk
              </h2>
              <span
                className="rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums"
                style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                {requests.length}
              </span>
            </div>

            {requests.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(true)}
                className="btn-ghost inline-flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-400"
                aria-label="Hapus semua request"
              >
                <Trash2 size={12} aria-hidden="true" />
                <span>Hapus semua</span>
              </button>
            )}
          </div>

          {/* Search Input */}
          <div className="border-b p-2" style={{ borderColor: 'var(--border)' }}>
            <div className="relative flex items-center">
              <Search
                size={13}
                className="absolute left-2.5 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari path, body, IP…"
                aria-label="Cari request masuk berdasarkan path, body, atau IP"
                spellCheck={false}
                autoComplete="off"
                className="input-text w-full pl-8 pr-7 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="btn-icon absolute right-1 h-6 w-6"
                  aria-label="Hapus pencarian"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Method Filter Pills */}
            <div
              className="mt-2 flex items-center gap-1 overflow-x-auto pb-1 text-[11px]"
              role="group"
              aria-label="Filter metode HTTP"
            >
              <button
                type="button"
                onClick={() => setFilterMethod('')}
                className={`rounded px-2 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                  filterMethod === ''
                    ? 'font-semibold'
                    : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: filterMethod === '' ? 'var(--accent-dim)' : 'transparent',
                  color: filterMethod === '' ? 'var(--accent)' : 'var(--text-muted)',
                }}
                aria-pressed={filterMethod === ''}
              >
                Semua
              </button>
              {HTTP_METHODS.map((m) => {
                const isActive = filterMethod === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFilterMethod(isActive ? '' : m)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                      isActive ? 'ring-1' : 'hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: isActive
                        ? `color-mix(in srgb, var(--method-${m.toLowerCase()}) 20%, transparent)`
                        : 'var(--surface-2)',
                      color: `var(--method-${m.toLowerCase()})`,
                      borderColor: `var(--method-${m.toLowerCase()})`,
                    }}
                    aria-pressed={isActive}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Request List */}
          <div
            className="min-h-0 flex-1 overflow-y-auto p-2"
            role="list"
            aria-label="Daftar request masuk"
            aria-live="polite"
          >
            {loadingRequests ? (
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
              isFilterActive ? (
                /* Empty state when filter/search yields no results */
                <div className="p-6 text-center">
                  <Filter
                    size={24}
                    className="mx-auto mb-2 opacity-40"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Tidak ada request yang sesuai dengan filter atau pencarian.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMethod('');
                      setSearchQuery('');
                    }}
                    className="btn-ghost mt-3 text-xs"
                  >
                    Reset filter
                  </button>
                </div>
              ) : (
                <EmptyState hookUrl={hookUrl} />
              )
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

        {/* Right Panel: Request Detail */}
        <main
          className={`min-w-0 flex-1 overflow-hidden flex flex-col ${
            selectedId === null ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedRequest ? (
            <RequestDetail
              request={selectedRequest}
              hookUrl={hookUrl}
              onDelete={() => handleDeleteSingle(selectedRequest.id)}
              onBackToList={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6 text-center">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  Belum ada request yang dipilih
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Pilih salah satu request di panel kiri untuk melihat Headers, Body, Query, dan cURL.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Delete All Confirmation Dialog */}
      <ConfirmModal
        isOpen={showDeleteAllConfirm}
        title="Hapus Semua Request?"
        description="Semua request yang tertangkap untuk endpoint ini akan dihapus secara permanen dari basis data. Tindakan ini tidak dapat dibatalkan."
        confirmLabel={isDeletingAll ? 'Menghapus…' : 'Ya, Hapus Semua'}
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={handleConfirmDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />

      {/* Settings Modal */}
      {endpoint && (
        <SettingsModal
          isOpen={showSettingsModal}
          endpoint={endpoint}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

/* ─── Empty State when no requests exist yet ─── */
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
