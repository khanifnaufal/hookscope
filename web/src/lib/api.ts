/**
 * API client — thin wrapper around fetch for Hookscope endpoints.
 * Persists manage_token in localStorage per endpoint ID.
 */

const BASE = import.meta.env.VITE_API_BASE ?? '';

export interface EndpointInfo {
  id: string;
  hook_url: string;
  response_status: number;
  response_body: string;
  response_content_type: string;
  response_delay_ms: number;
  hmac_secret: string | null;
  hmac_algo: string | null;
  hmac_header: string | null;
  created_at: string;
  expires_at: string;
}

export interface CreateEndpointResult {
  id: string;
  manage_token: string;
  hook_url: string;
  expires_at: string;
}

export interface RequestItem {
  id: number;
  endpoint_id: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: string | null;
  content_type: string | null;
  ip: string | null;
  size_bytes: number;
  signature_valid: boolean | null;
  received_at: string;
}

export interface ListRequestsResult {
  items: RequestItem[];
  total: number;
  limit: number;
  offset: number;
}

function getToken(endpointId: string): string {
  return localStorage.getItem(`hookscope-token-${endpointId}`) ?? '';
}

function authHeaders(endpointId: string): Record<string, string> {
  const token = getToken(endpointId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createEndpoint(): Promise<CreateEndpointResult> {
  const res = await fetch(`${BASE}/api/endpoints`, { method: 'POST' });
  if (!res.ok) throw new Error(`Gagal membuat endpoint: ${res.status}`);
  const data = (await res.json()) as CreateEndpointResult;
  localStorage.setItem(`hookscope-token-${data.id}`, data.manage_token);
  return data;
}

export async function getEndpoint(id: string): Promise<EndpointInfo> {
  const res = await fetch(`${BASE}/api/endpoints/${id}`, {
    headers: authHeaders(id),
  });
  if (!res.ok) throw new Error(`Endpoint tidak ditemukan: ${res.status}`);
  return res.json() as Promise<EndpointInfo>;
}

export interface UpdateEndpointInput {
  response_status?: number;
  response_body?: string;
  response_content_type?: string;
  response_delay_ms?: number;
  hmac_secret?: string | null;
  hmac_algo?: 'sha256' | 'sha1' | null;
  hmac_header?: string | null;
}

export async function updateEndpoint(
  endpointId: string,
  data: UpdateEndpointInput,
): Promise<EndpointInfo> {
  const res = await fetch(`${BASE}/api/endpoints/${endpointId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(endpointId),
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let errorMsg = `Gagal menyimpan pengaturan: ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson.details && Array.isArray(errJson.details)) {
        errorMsg = errJson.details.map((d: { message: string }) => d.message).join(', ');
      } else if (errJson.error) {
        errorMsg = errJson.error;
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<EndpointInfo>;
}

export async function listRequests(
  id: string,
  params: { limit?: number; offset?: number; method?: string; search?: string } = {},
): Promise<ListRequestsResult> {
  const sp = new URLSearchParams();
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  if (params.method) sp.set('method', params.method);
  if (params.search) sp.set('search', params.search);

  const res = await fetch(`${BASE}/api/endpoints/${id}/requests?${sp}`, {
    headers: authHeaders(id),
  });
  if (!res.ok) throw new Error(`Gagal memuat request: ${res.status}`);
  return res.json() as Promise<ListRequestsResult>;
}

export async function deleteRequest(endpointId: string, requestId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/endpoints/${endpointId}/requests/${requestId}`, {
    method: 'DELETE',
    headers: authHeaders(endpointId),
  });
  if (!res.ok) throw new Error(`Gagal menghapus request: ${res.status}`);
}

export async function deleteAllRequests(endpointId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/endpoints/${endpointId}/requests`, {
    method: 'DELETE',
    headers: authHeaders(endpointId),
  });
  if (!res.ok) throw new Error(`Gagal menghapus semua request: ${res.status}`);
}

export interface ReplayResult {
  ok: boolean;
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
  target_url: string;
}

export async function replayRequest(
  endpointId: string,
  requestId: number,
  targetUrl: string,
): Promise<ReplayResult> {
  const res = await fetch(`${BASE}/api/endpoints/${endpointId}/requests/${requestId}/replay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(endpointId),
    },
    body: JSON.stringify({ target_url: targetUrl }),
  });

  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data.message || data.error || `Replay gagal (${res.status})`;
    throw new Error(errorMsg);
  }

  return data as ReplayResult;
}

export async function deleteEndpoint(endpointId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/endpoints/${endpointId}`, {
    method: 'DELETE',
    headers: authHeaders(endpointId),
  });
  if (!res.ok) throw new Error(`Gagal menghapus endpoint: ${res.status}`);
  localStorage.removeItem(`hookscope-token-${endpointId}`);
}

