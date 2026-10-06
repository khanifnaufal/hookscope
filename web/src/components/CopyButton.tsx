/**
 * CopyButton — button that copies text to clipboard and shows feedback.
 * Shows "Tersalin!" for 2 seconds after copy.
 */
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Salin', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: create a temporary textarea
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`btn-ghost inline-flex items-center gap-1.5 text-xs ${className}`}
      aria-label={copied ? 'Tersalin!' : label}
    >
      {copied ? (
        <>
          <Check size={13} aria-hidden="true" />
          <span>Tersalin!</span>
        </>
      ) : (
        <>
          <Copy size={13} aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
