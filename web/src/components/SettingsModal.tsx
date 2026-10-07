/**
 * SettingsModal — Accessible dialog for configuring endpoint custom response
 * and HMAC signature verification. Includes focus trap, Esc support, inline
 * validation, and focus restoration to trigger element.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Sliders, ShieldCheck, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { EndpointInfo, UpdateEndpointInput } from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  endpoint: EndpointInfo;
  onClose: () => void;
  onSave: (data: UpdateEndpointInput) => Promise<void>;
}

export function SettingsModal({
  isOpen,
  endpoint,
  onClose,
  onSave,
}: SettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [responseStatus, setResponseStatus] = useState(String(endpoint.response_status));
  const [responseContentType, setResponseContentType] = useState(endpoint.response_content_type);
  const [responseDelayMs, setResponseDelayMs] = useState(String(endpoint.response_delay_ms));
  const [responseBody, setResponseBody] = useState(endpoint.response_body);

  const [hmacHeader, setHmacHeader] = useState(endpoint.hmac_header ?? '');
  const [hmacAlgo, setHmacAlgo] = useState<'sha256' | 'sha1'>(
    (endpoint.hmac_algo as 'sha256' | 'sha1') || 'sha256',
  );
  const [hmacSecret, setHmacSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isSecretMaskedSaved, setIsSecretMaskedSaved] = useState(Boolean(endpoint.hmac_secret));

  // Status & error states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Reset form when modal opens or endpoint changes
  useEffect(() => {
    if (isOpen) {
      setResponseStatus(String(endpoint.response_status));
      setResponseContentType(endpoint.response_content_type);
      setResponseDelayMs(String(endpoint.response_delay_ms));
      setResponseBody(endpoint.response_body);
      setHmacHeader(endpoint.hmac_header ?? '');
      setHmacAlgo((endpoint.hmac_algo as 'sha256' | 'sha1') || 'sha256');
      setHmacSecret('');
      setIsSecretMaskedSaved(Boolean(endpoint.hmac_secret));
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen, endpoint]);

  // Focus trap, initial focus & Esc handler
  useEffect(() => {
    if (!isOpen) return;

    triggerRef.current = document.activeElement as HTMLElement | null;

    const timeout = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isOpen, onClose]);

  // Form validation
  const validate = useCallback(() => {
    const errs: Record<string, string> = {};

    const statusNum = parseInt(responseStatus, 10);
    if (Number.isNaN(statusNum) || statusNum < 100 || statusNum > 599) {
      errs.responseStatus = 'Status code HTTP harus antara 100 dan 599';
    }

    if (!responseContentType.trim()) {
      errs.responseContentType = 'Content-Type tidak boleh kosong';
    }

    const delayNum = parseInt(responseDelayMs, 10);
    if (Number.isNaN(delayNum) || delayNum < 0 || delayNum > 10000) {
      errs.responseDelayMs = 'Delay harus antara 0 dan 10.000 ms (maksimal 10 detik)';
    }

    // Body JSON validation check if content type is JSON
    if (responseContentType.includes('json') && responseBody.trim()) {
      try {
        JSON.parse(responseBody);
      } catch {
        errs.responseBody = 'Format JSON tidak valid';
      }
    }

    // HMAC validation
    if (hmacHeader.trim() && !hmacSecret.trim() && !isSecretMaskedSaved) {
      errs.hmacSecret = 'Secret wajib diisi jika header signature ditentukan';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [
    responseStatus,
    responseContentType,
    responseDelayMs,
    responseBody,
    hmacHeader,
    hmacSecret,
    isSecretMaskedSaved,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) {
      // Focus first error field
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const el = modalRef.current?.querySelector(`[name="${firstErrorKey}"]`) as HTMLElement | null;
        el?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateEndpointInput = {
        response_status: parseInt(responseStatus, 10),
        response_content_type: responseContentType.trim(),
        response_delay_ms: parseInt(responseDelayMs, 10),
        response_body: responseBody,
        hmac_header: hmacHeader.trim() ? hmacHeader.trim() : null,
        hmac_algo: hmacHeader.trim() ? hmacAlgo : null,
      };

      // Only update hmac_secret if user entered a new secret or wants to clear it
      if (hmacSecret.trim()) {
        payload.hmac_secret = hmacSecret.trim();
      } else if (!isSecretMaskedSaved || !hmacHeader.trim()) {
        payload.hmac_secret = null;
      }

      await onSave(payload);
      onClose();
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearHmac = () => {
    setHmacHeader('');
    setHmacSecret('');
    setIsSecretMaskedSaved(false);
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.hmacSecret;
      delete copy.hmacHeader;
      return copy;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-desc"
        className="w-full max-w-lg rounded-xl border p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: 'var(--accent-dim)', color: 'var(--accent)' }}
              aria-hidden="true"
            >
              <Sliders size={18} />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Pengaturan Endpoint
              </h2>
              <p id="settings-dialog-desc" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Konfigurasi respon otomatis dan verifikasi signature webhook.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup jendela pengaturan"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {generalError && (
          <div
            className="mt-4 rounded-lg p-3 text-xs"
            style={{ backgroundColor: 'rgba(247, 90, 90, 0.12)', color: 'var(--danger)' }}
            role="alert"
          >
            {generalError}
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          {/* ─── SECTION 1: CUSTOM RESPONSE ─── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              <span>Respon Kustom Webhook</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status Code */}
              <div>
                <label
                  htmlFor="field-response-status"
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text)' }}
                >
                  Status Code
                </label>
                <input
                  ref={firstInputRef}
                  id="field-response-status"
                  name="responseStatus"
                  type="number"
                  min={100}
                  max={599}
                  value={responseStatus}
                  onChange={(e) => setResponseStatus(e.target.value)}
                  disabled={isSubmitting}
                  className="input-text w-full font-mono text-xs tabular-nums"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                {errors.responseStatus && (
                  <p className="mt-1 text-[11px] text-rose-500" role="alert">
                    {errors.responseStatus}
                  </p>
                )}
              </div>

              {/* Delay (ms) */}
              <div>
                <label
                  htmlFor="field-response-delay"
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text)' }}
                >
                  Delay Respon (ms)
                </label>
                <input
                  id="field-response-delay"
                  name="responseDelayMs"
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={responseDelayMs}
                  onChange={(e) => setResponseDelayMs(e.target.value)}
                  disabled={isSubmitting}
                  className="input-text w-full font-mono text-xs tabular-nums"
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.responseDelayMs && (
                  <p className="mt-1 text-[11px] text-rose-500" role="alert">
                    {errors.responseDelayMs}
                  </p>
                )}
                <span className="block mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Maksimal 10.000&nbsp;ms (10&nbsp;detik)
                </span>
              </div>
            </div>

            {/* Content-Type */}
            <div>
              <label
                htmlFor="field-response-content-type"
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text)' }}
              >
                Content-Type
              </label>
              <input
                id="field-response-content-type"
                name="responseContentType"
                type="text"
                value={responseContentType}
                onChange={(e) => setResponseContentType(e.target.value)}
                disabled={isSubmitting}
                className="input-text w-full font-mono text-xs"
                placeholder="application/json…"
                autoComplete="off"
                spellCheck={false}
                required
              />
              {errors.responseContentType && (
                <p className="mt-1 text-[11px] text-rose-500" role="alert">
                  {errors.responseContentType}
                </p>
              )}
            </div>

            {/* Response Body */}
            <div>
              <label
                htmlFor="field-response-body"
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text)' }}
              >
                Response Body
              </label>
              <textarea
                id="field-response-body"
                name="responseBody"
                rows={3}
                value={responseBody}
                onChange={(e) => setResponseBody(e.target.value)}
                disabled={isSubmitting}
                className="input-text w-full font-mono text-xs resize-y"
                placeholder='{"ok":true}…'
                autoComplete="off"
                spellCheck={false}
              />
              {errors.responseBody && (
                <p className="mt-1 text-[11px] text-rose-500" role="alert">
                  {errors.responseBody}
                </p>
              )}
            </div>
          </div>

          {/* ─── SECTION 2: HMAC VERIFICATION ─── */}
          <div className="space-y-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                <ShieldCheck size={14} aria-hidden="true" />
                <span>Verifikasi Signature HMAC</span>
              </div>

              {(hmacHeader || isSecretMaskedSaved) && (
                <button
                  type="button"
                  onClick={handleClearHmac}
                  disabled={isSubmitting}
                  className="btn-ghost text-[11px] text-rose-500 hover:text-rose-400 py-0.5 px-1.5"
                >
                  Nonaktifkan HMAC
                </button>
              )}
            </div>

            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Verifikasi signature otomatis untuk webhook dari GitHub, Stripe, atau payment gateway. Secret tidak pernah dikirim kembali utuh.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Header Name */}
              <div className="sm:col-span-2">
                <label
                  htmlFor="field-hmac-header"
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text)' }}
                >
                  Nama Header Signature
                </label>
                <input
                  id="field-hmac-header"
                  name="hmacHeader"
                  type="text"
                  value={hmacHeader}
                  onChange={(e) => setHmacHeader(e.target.value)}
                  disabled={isSubmitting}
                  className="input-text w-full font-mono text-xs"
                  placeholder="X-Hub-Signature-256…"
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.hmacHeader && (
                  <p className="mt-1 text-[11px] text-rose-500" role="alert">
                    {errors.hmacHeader}
                  </p>
                )}
              </div>

              {/* Algorithm */}
              <div>
                <label
                  htmlFor="field-hmac-algo"
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text)' }}
                >
                  Algoritma
                </label>
                <select
                  id="field-hmac-algo"
                  name="hmacAlgo"
                  value={hmacAlgo}
                  onChange={(e) => setHmacAlgo(e.target.value as 'sha256' | 'sha1')}
                  disabled={isSubmitting}
                  className="input-text w-full font-mono text-xs"
                >
                  <option value="sha256">SHA-256</option>
                  <option value="sha1">SHA-1</option>
                </select>
              </div>
            </div>

            {/* Secret Key */}
            <div>
              <label
                htmlFor="field-hmac-secret"
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text)' }}
              >
                Secret Key
              </label>
              <div className="relative flex items-center">
                <KeyRound
                  size={14}
                  className="absolute left-2.5 pointer-events-none"
                  style={{ color: 'var(--text-muted)' }}
                  aria-hidden="true"
                />
                <input
                  id="field-hmac-secret"
                  name="hmacSecret"
                  type={showSecret ? 'text' : 'password'}
                  value={hmacSecret}
                  onChange={(e) => setHmacSecret(e.target.value)}
                  disabled={isSubmitting}
                  className="input-text w-full pl-8 pr-9 font-mono text-xs"
                  placeholder={
                    isSecretMaskedSaved
                      ? '•••••••• (Secret tersimpan, isi untuk ganti)…'
                      : 'Masukkan webhook secret…'
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((prev) => !prev)}
                  disabled={isSubmitting}
                  className="btn-icon absolute right-1 h-7 w-7"
                  aria-label={showSecret ? 'Sembunyikan secret' : 'Tampilkan secret'}
                >
                  {showSecret ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                </button>
              </div>

              {isSecretMaskedSaved && !hmacSecret && (
                <p className="mt-1 text-[11px]" style={{ color: 'var(--success)' }}>
                  ✓ Secret aktif tersimpan di server.
                </p>
              )}

              {errors.hmacSecret && (
                <p className="mt-1 text-[11px] text-rose-500" role="alert">
                  {errors.hmacSecret}
                </p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary text-xs inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  <span>Menyimpan…</span>
                </>
              ) : (
                <span>Simpan Pengaturan</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
