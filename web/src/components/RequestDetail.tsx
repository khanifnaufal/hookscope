/**
 * RequestDetail — comprehensive detail panel for a selected webhook request.
 * Includes tabs for Headers, Body, and Query with ARIA tablist keyboard navigation,
 * copy cURL, copy body, internal scrollable body, and strictly safe text rendering (no XSS).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Trash2,
  Terminal,
  Code2,
  ListFilter,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Info,
} from 'lucide-react';
import type { RequestItem } from '../lib/api';
import { generateCurl, parseHeaders } from '../lib/curl';
import { CopyButton } from './CopyButton';
import { MethodBadge } from './MethodBadge';
import { formatBytes, formatRelative } from '../lib/format';

interface RequestDetailProps {
  request: RequestItem;
  hookUrl: string;
  onDelete: () => void;
  onBackToList?: () => void; // for mobile back navigation
}

type TabKey = 'headers' | 'body' | 'query' | 'signature';

interface TabDefinition {
  key: TabKey;
  label: string;
  count?: number;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
  icon: typeof Code2;
}

export function RequestDetail({
  request,
  hookUrl,
  onDelete,
  onBackToList,
}: RequestDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('body');
  const [headerFilter, setHeaderFilter] = useState('');
  const tabRefs = useRef<Map<TabKey, HTMLButtonElement>>(new Map());

  // Parse headers safely
  const headers = useMemo(() => parseHeaders(request.headers), [request.headers]);
  const headerEntries = useMemo(() => Object.entries(headers), [headers]);

  // Filtered headers
  const filteredHeaders = useMemo(() => {
    if (!headerFilter.trim()) return headerEntries;
    const q = headerFilter.toLowerCase();
    return headerEntries.filter(
      ([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q),
    );
  }, [headerEntries, headerFilter]);

  // Parse query parameters safely
  const queryEntries = useMemo(() => {
    if (!request.query) return [];
    let parsed = request.query;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return [];
      }
    }
    if (typeof parsed !== 'object' || parsed === null) return [];
    return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
      k,
      v !== undefined && v !== null ? String(v) : '',
    ]);
  }, [request.query]);

  // Format body (pretty JSON or raw text)
  const bodyInfo = useMemo(() => {
    if (!request.body) {
      return { isJson: false, text: null, isEmpty: true };
    }
    try {
      const parsed = JSON.parse(request.body);
      return {
        isJson: true,
        text: JSON.stringify(parsed, null, 2),
        isEmpty: false,
      };
    } catch {
      return {
        isJson: false,
        text: request.body,
        isEmpty: false,
      };
    }
  }, [request.body]);

  // Default to body tab if body exists, otherwise headers
  useEffect(() => {
    if (bodyInfo.isEmpty && headerEntries.length > 0) {
      setActiveTab('headers');
    } else {
      setActiveTab('body');
    }
    setHeaderFilter('');
  }, [request.id, bodyInfo.isEmpty, headerEntries.length]);

  // Detected signature headers in incoming request
  const detectedSignatures = useMemo(() => {
    return headerEntries.filter(([k]) =>
      /signature|hub-signature|stripe-signature|x-sig|webhook-signature/i.test(k),
    );
  }, [headerEntries]);

  // Tabs definition
  const tabs: TabDefinition[] = useMemo(
    () => [
      {
        key: 'body',
        label: 'Body',
        count: bodyInfo.isEmpty ? undefined : request.size_bytes,
        icon: Code2,
      },
      {
        key: 'headers',
        label: 'Headers',
        count: headerEntries.length,
        icon: ListFilter,
      },
      {
        key: 'query',
        label: 'Query',
        count: queryEntries.length > 0 ? queryEntries.length : undefined,
        icon: Terminal,
      },
      {
        key: 'signature',
        label: 'Signature',
        badge:
          request.signature_valid === true
            ? 'Valid'
            : request.signature_valid === false
              ? 'Invalid'
              : undefined,
        badgeColor:
          request.signature_valid === true
            ? 'var(--success)'
            : request.signature_valid === false
              ? 'var(--danger)'
              : undefined,
        badgeBg:
          request.signature_valid === true
            ? 'rgba(62, 207, 142, 0.15)'
            : request.signature_valid === false
              ? 'rgba(247, 90, 90, 0.15)'
              : undefined,
        icon: ShieldCheck,
      },
    ],
    [
      bodyInfo.isEmpty,
      request.size_bytes,
      headerEntries.length,
      queryEntries.length,
      request.signature_valid,
    ],
  );

  // Keyboard navigation for ARIA tabs (ArrowLeft, ArrowRight, Home, End)
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, currentKey: TabKey) => {
      const tabKeys: TabKey[] = ['body', 'headers', 'query', 'signature'];
      const currentIndex = tabKeys.indexOf(currentKey);

      let nextIndex = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % tabKeys.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + tabKeys.length) % tabKeys.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabKeys.length - 1;
      }

      if (nextIndex !== -1) {
        e.preventDefault();
        const nextKey = tabKeys[nextIndex];
        setActiveTab(nextKey);
        tabRefs.current.get(nextKey)?.focus();
      }
    },
    [],
  );

  // Generate reproducible cURL command
  const curlCommand = useMemo(() => generateCurl(request, hookUrl), [request, hookUrl]);

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden" data-testid="request-detail">
      {/* ─── Detail Header ─── */}
      <div
        className="flex-shrink-0 border-b p-4 sm:p-6"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <div className="w-full max-w-5xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {onBackToList && (
              <button
                type="button"
                onClick={onBackToList}
                className="btn-icon sm:hidden"
                aria-label="Kembali ke daftar request"
              >
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <MethodBadge method={request.method} />
                <code
                  className="min-w-0 break-all font-mono text-sm font-semibold tracking-tight"
                  style={{ color: 'var(--text)' }}
                >
                  {request.path}
                </code>
              </div>

              {/* Request metadata */}
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <time dateTime={request.received_at}>
                  {new Date(request.received_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  {' · '}
                  {formatRelative(request.received_at)}
                </time>
                <span aria-hidden="true">&middot;</span>
                <span>IP: {request.ip || '–'}</span>
                <span aria-hidden="true">&middot;</span>
                <span className="font-mono tabular-nums">{formatBytes(request.size_bytes)}</span>
                {request.content_type && (
                  <>
                    <span aria-hidden="true">&middot;</span>
                    <span className="truncate max-w-[200px]" title={request.content_type}>
                      {request.content_type}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons: Copy cURL and Delete */}
          <div className="flex items-center gap-2">
            <CopyButton
              text={curlCommand}
              label="Salin cURL"
              aria-label="Salin request sebagai perintah cURL"
            />

            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-400 focus-visible:ring-rose-500"
              onClick={onDelete}
              aria-label="Hapus request ini"
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>Hapus</span>
            </button>
          </div>
        </div>

        {/* ─── Tabs List (W3C ARIA Tablist) ─── */}
        <div
          role="tablist"
          aria-label="Bagian detail request"
          className="mt-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.key, el);
                  else tabRefs.current.delete(tab.key);
                }}
                type="button"
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={isSelected}
                aria-controls={`panel-${tab.key}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(e) => handleTabKeyDown(e, tab.key)}
                className={`relative inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  isSelected ? 'font-semibold' : 'hover:opacity-80'
                }`}
                style={{
                  color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className="rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums"
                    style={{
                      backgroundColor: isSelected ? 'var(--accent-dim)' : 'var(--surface-2)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {tab.key === 'body' ? formatBytes(tab.count) : tab.count}
                  </span>
                )}
                {tab.badge !== undefined && (
                  <span
                    className="rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold"
                    style={{
                      backgroundColor: tab.badgeBg ?? 'var(--surface-2)',
                      color: tab.badgeColor ?? 'var(--text-muted)',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
                {/* Active indicator bar */}
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--accent)' }}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      {/* ─── Tab Panels ─── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* TAB PANEL: BODY */}
        <div
          role="tabpanel"
          id="panel-body"
          aria-labelledby="tab-body"
          tabIndex={0}
          hidden={activeTab !== 'body'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <div className="w-full max-w-5xl mx-auto flex flex-1 flex-col min-h-0 overflow-hidden">
            {bodyInfo.isEmpty ? (
              <div
                className="flex h-48 items-center justify-center rounded-lg border border-dashed"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Tidak ada request body (kosong)
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">
                      {bodyInfo.isJson ? 'JSON (Pretty-printed)' : 'Raw Text'}
                    </span>
                    <span>&middot;</span>
                    <span className="font-mono tabular-nums">{formatBytes(request.size_bytes)}</span>
                  </div>
                  {bodyInfo.text && (
                    <CopyButton text={bodyInfo.text} label="Salin body" />
                  )}
                </div>

                {/* Scrollable body box - scrolls inside itself, not the entire page */}
                <div
                  className="flex-1 min-h-0 overflow-auto rounded-lg border p-4"
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <pre
                    className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap select-text"
                    style={{ color: 'var(--text)' }}
                  >
                    {/* Strict plain text rendering: React safely escapes this without evaluation */}
                    {bodyInfo.text}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TAB PANEL: HEADERS */}
        <div
          role="tabpanel"
          id="panel-headers"
          aria-labelledby="tab-headers"
          tabIndex={0}
          hidden={activeTab !== 'headers'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <div className="w-full max-w-5xl mx-auto flex flex-1 flex-col min-h-0 overflow-hidden">
            {headerEntries.length === 0 ? (
              <div
                className="flex h-48 items-center justify-center rounded-lg border border-dashed"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Tidak ada HTTP headers
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                {/* Header search filter & copy all */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <input
                    type="search"
                    value={headerFilter}
                    onChange={(e) => setHeaderFilter(e.target.value)}
                    placeholder="Filter headers…"
                    aria-label="Filter HTTP headers"
                    spellCheck={false}
                    autoComplete="off"
                    className="input-text text-xs max-w-xs"
                  />

                  <CopyButton
                    text={headerEntries.map(([k, v]) => `${k}: ${v}`).join('\n')}
                    label="Salin semua"
                    aria-label="Salin semua HTTP header"
                  />
                </div>

                {/* Scrollable headers table */}
                <div
                  className="flex-1 min-h-0 overflow-auto rounded-lg border"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {filteredHeaders.length === 0 ? (
                    <div className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      Tidak ada header yang cocok dengan &ldquo;{headerFilter}&rdquo;
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr
                          className="border-b"
                          style={{
                            borderColor: 'var(--border)',
                            backgroundColor: 'var(--surface-2)',
                          }}
                        >
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Header
                          </th>
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Value
                          </th>
                          <th className="w-16 px-2 py-2" aria-label="Aksi"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {filteredHeaders.map(([key, value]) => (
                          <tr
                            key={key}
                            className="hover:bg-[var(--surface-2)] transition-colors group"
                          >
                            <td
                              className="px-4 py-2 font-medium align-top whitespace-nowrap"
                              style={{ color: 'var(--accent)' }}
                            >
                              {key}
                            </td>
                            <td
                              className="px-4 py-2 align-top break-all"
                              style={{ color: 'var(--text)' }}
                            >
                              {/* Strictly safe text rendering */}
                              {value}
                            </td>
                            <td className="px-2 py-2 align-top text-right">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <CopyButton text={value} label="Salin" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TAB PANEL: QUERY */}
        <div
          role="tabpanel"
          id="panel-query"
          aria-labelledby="tab-query"
          tabIndex={0}
          hidden={activeTab !== 'query'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <div className="w-full max-w-5xl mx-auto flex flex-1 flex-col min-h-0 overflow-hidden">
            {queryEntries.length === 0 ? (
              <div
                className="flex h-48 items-center justify-center rounded-lg border border-dashed"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Tidak ada parameter query URL
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {queryEntries.length} parameter
                  </span>
                  <CopyButton
                    text={queryEntries.map(([k, v]) => `${k}=${v}`).join('&')}
                    label="Salin query"
                    aria-label="Salin semua query parameters"
                  />
                </div>

                {/* Scrollable query table */}
                <div
                  className="flex-1 min-h-0 overflow-auto rounded-lg border"
                  style={{
                    backgroundColor: 'var(--surface)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <table className="w-full border-collapse text-left font-mono text-xs">
                    <thead>
                      <tr
                        className="border-b"
                        style={{
                          borderColor: 'var(--border)',
                          backgroundColor: 'var(--surface-2)',
                        }}
                      >
                        <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Key
                        </th>
                        <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Value
                        </th>
                        <th className="w-16 px-2 py-2" aria-label="Aksi"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {queryEntries.map(([key, value]) => (
                        <tr
                          key={key}
                          className="hover:bg-[var(--surface-2)] transition-colors group"
                        >
                          <td
                            className="px-4 py-2 font-medium align-top whitespace-nowrap"
                            style={{ color: 'var(--accent)' }}
                          >
                            {key}
                          </td>
                          <td
                            className="px-4 py-2 align-top break-all"
                            style={{ color: 'var(--text)' }}
                          >
                            {/* Strictly safe text rendering */}
                            {value}
                          </td>
                          <td className="px-2 py-2 align-top text-right">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <CopyButton text={value} label="Salin" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TAB PANEL: SIGNATURE */}
        <div
          role="tabpanel"
          id="panel-signature"
          aria-labelledby="tab-signature"
          tabIndex={0}
          hidden={activeTab !== 'signature'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <div className="w-full max-w-5xl mx-auto space-y-6">
            {/* Status Card (Always has icon + text, never color alone) */}
            <div
              className="rounded-xl border p-4 sm:p-5 flex items-start gap-3.5"
              style={{
                backgroundColor:
                  request.signature_valid === true
                    ? 'rgba(62, 207, 142, 0.08)'
                    : request.signature_valid === false
                      ? 'rgba(247, 90, 90, 0.08)'
                      : 'var(--surface-2)',
                borderColor:
                  request.signature_valid === true
                    ? 'rgba(62, 207, 142, 0.3)'
                    : request.signature_valid === false
                      ? 'rgba(247, 90, 90, 0.3)'
                      : 'var(--border)',
              }}
            >
              <div className="flex-shrink-0 mt-0.5">
                {request.signature_valid === true ? (
                  <CheckCircle2 size={20} style={{ color: 'var(--success)' }} aria-hidden="true" />
                ) : request.signature_valid === false ? (
                  <XCircle size={20} style={{ color: 'var(--danger)' }} aria-hidden="true" />
                ) : (
                  <MinusCircle size={20} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-sm font-semibold tracking-tight"
                  style={{
                    color:
                      request.signature_valid === true
                        ? 'var(--success)'
                        : request.signature_valid === false
                          ? 'var(--danger)'
                          : 'var(--text)',
                  }}
                >
                  {request.signature_valid === true
                    ? 'Signature Valid'
                    : request.signature_valid === false
                      ? 'Signature Tidak Valid'
                      : 'Tidak Ada Signature'}
                </h3>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {request.signature_valid === true
                    ? 'Signature HMAC pada request ini cocok dengan secret dan algoritma yang dikonfigurasi.'
                    : request.signature_valid === false
                      ? 'Header signature terdeteksi, tetapi nilainya tidak cocok dengan hasil perhitungan hash payload body.'
                      : 'Request ini tidak menyertakan header signature, atau endpoint belum mengaktifkan verifikasi HMAC.'}
                </p>
              </div>
            </div>

            {/* Detected Signature Headers */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Header Signature Terdeteksi
              </h4>
              {detectedSignatures.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed p-4 text-center text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Tidak ada header signature standar (misal: <code>X-Hub-Signature-256</code>, <code>X-Signature</code>) pada request ini.
                </div>
              ) : (
                <div
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
                >
                  <table className="w-full border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
                        <th className="px-4 py-2 text-left font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Header
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Nilai
                        </th>
                        <th className="w-16 px-2 py-2" aria-label="Aksi"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {detectedSignatures.map(([key, val]) => (
                        <tr key={key} className="hover:bg-[var(--surface-2)] transition-colors group">
                          <td className="px-4 py-2 font-medium align-top whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                            {key}
                          </td>
                          <td className="px-4 py-2 align-top break-all" style={{ color: 'var(--text)' }}>
                            {val}
                          </td>
                          <td className="px-2 py-2 align-top text-right">
                            <CopyButton text={val} label="Salin" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Explanatory Info Card */}
            <div
              className="rounded-lg p-3.5 border flex items-start gap-2.5 text-xs leading-relaxed"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <Info size={16} className="flex-shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <span className="font-medium" style={{ color: 'var(--text)' }}>
                  Bagaimana verifikasi bekerja?
                </span>
                <p className="mt-0.5">
                  Hookscope membandingkan hash HMAC dari raw request body dengan nilai header signature menggunakan perbandingan konstan waktu (<em>timingSafeEqual</em>) untuk mencegah kebocoran side-channel.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

