/**
 * MethodBadge — colored badge for HTTP method.
 * Always renders visible text (not color-only) for accessibility.
 */

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-[var(--method-get)] text-black',
  POST: 'bg-[var(--method-post)] text-white',
  PUT: 'bg-[var(--method-put)] text-black',
  PATCH: 'bg-[var(--method-patch)] text-white',
  DELETE: 'bg-[var(--method-delete)] text-white',
  HEAD: 'bg-[var(--method-head)] text-white',
  OPTIONS: 'bg-[var(--method-options)] text-white',
};

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({ method, className = '' }: MethodBadgeProps) {
  const colorClass = METHOD_COLORS[method.toUpperCase()] ?? 'bg-[var(--text-muted)] text-white';
  return (
    <span
      className={`method-badge ${colorClass} ${className}`}
      aria-label={`Metode ${method}`}
    >
      {method}
    </span>
  );
}
