/**
 * Format a date string into a relative time label (e.g., "2 menit lalu").
 */
export function formatRelative(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000); // seconds

  if (diff < 5) return 'baru saja';
  if (diff < 60) return `${diff} detik lalu`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

/**
 * Format bytes into a human readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format a countdown from now to a future date.
 */
export function formatCountdown(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((then - now) / 1000);

  if (diff <= 0) return 'Kadaluarsa';
  const days = Math.floor(diff / (60 * 60 * 24));
  const hours = Math.floor((diff % (60 * 60 * 24)) / 3600);
  if (days > 0) return `${days}h ${hours}j`;
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  if (hours > 0) return `${hours}j ${mins}m`;
  return `${mins}m ${secs}d`;
}
