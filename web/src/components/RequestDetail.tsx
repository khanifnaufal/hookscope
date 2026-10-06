/**
 * RequestDetail — comprehensive detail panel for a selected webhook request.
 * Includes tabs for Headers, Body, and Query with ARIA tablist keyboard navigation,
 * copy cURL, copy body, internal scrollable body, and strictly safe text rendering (no XSS).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Trash2, Terminal, Code2, ListFilter, ArrowLeft } from 'lucide-react';
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

type TabKey = 'headers' | 'body' | 'query';

interface TabDefinition {
  key: TabKey;
  label: string;
  count?: number;
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
    ],
    [bodyInfo.isEmpty, request.size_bytes, headerEntries.length, queryEntries.length],
  );

  // Keyboard navigation for ARIA tabs (ArrowLeft, ArrowRight, Home, End)
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, currentKey: TabKey) => {
      const tabKeys: TabKey[] = ['body', 'headers', 'query'];
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
    <div className="flex h-full flex-col overflow-hidden" data-testid="request-detail">
      {/* ─── Detail Header ─── */}
      <div
        className="flex-shrink-0 border-b p-4 sm:p-6"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
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

        {/* TAB PANEL: HEADERS */}
        <div
          role="tabpanel"
          id="panel-headers"
          aria-labelledby="tab-headers"
          tabIndex={0}
          hidden={activeTab !== 'headers'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
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

        {/* TAB PANEL: QUERY */}
        <div
          role="tabpanel"
          id="panel-query"
          aria-labelledby="tab-query"
          tabIndex={0}
          hidden={activeTab !== 'query'}
          className="flex h-full flex-col min-h-0 p-4 sm:p-6 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
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
    </div>
  );
}
