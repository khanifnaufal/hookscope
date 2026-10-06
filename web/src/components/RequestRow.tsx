/**
 * RequestRow — a single row in the request list.
 * Shows method badge, path, relative time, and size.
 * Flashes briefly on mount to indicate "new" if isNew is true.
 */
import { useEffect, useRef, useState } from 'react';
import { MethodBadge } from './MethodBadge';
import { formatRelative, formatBytes } from '../lib/format';
import type { RequestItem } from '../lib/api';

interface RequestRowProps {
  request: RequestItem;
  isSelected: boolean;
  isNew?: boolean;
  onClick: () => void;
}

export function RequestRow({ request, isSelected, isNew, onClick }: RequestRowProps) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [flash, setFlash] = useState(isNew ?? false);

  useEffect(() => {
    if (isNew) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [isNew]);

  return (
    <button
      ref={rowRef}
      type="button"
      aria-selected={isSelected}
      aria-label={`${request.method} ${request.path}`}
      onClick={onClick}
      className={[
        'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-100 text-left',
        flash ? 'flash-new' : '',
        isSelected
          ? 'bg-[var(--accent-dim)] text-[var(--text)]'
          : 'hover:bg-white/5 text-[var(--text)]',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <MethodBadge method={request.method} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-muted)]">
        {request.path}
      </span>
      <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] text-[var(--text-muted)]">
          {formatRelative(request.received_at)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">
          {formatBytes(request.size_bytes)}
        </span>
      </div>
    </button>
  );
}
