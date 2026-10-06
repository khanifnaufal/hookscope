/**
 * LiveIndicator — shows SSE connection status with visual and text feedback.
 * Changes from pulsing green dot (live) to yellow (disconnected/connecting).
 */
import type { SSEStatus } from '../lib/sse';

const STATUS_LABEL: Record<SSEStatus, string> = {
  live: 'Live',
  connecting: 'Menghubungkan…',
  disconnected: 'Terputus',
};

interface LiveIndicatorProps {
  status: SSEStatus;
}

export function LiveIndicator({ status }: LiveIndicatorProps) {
  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      role="status"
      aria-live="polite"
      aria-label={`Status koneksi: ${STATUS_LABEL[status]}`}
    >
      <span
        className={`live-dot ${status !== 'live' ? 'disconnected' : ''}`}
        aria-hidden="true"
      />
      <span
        style={{
          color: status === 'live' ? 'var(--success)' : 'var(--warning)',
        }}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
