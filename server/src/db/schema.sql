-- Hookscope database schema

CREATE TABLE IF NOT EXISTS endpoints (
  id                    TEXT PRIMARY KEY,
  manage_token          TEXT NOT NULL,
  response_status       INTEGER NOT NULL DEFAULT 200,
  response_body         TEXT NOT NULL DEFAULT '{"ok":true}',
  response_content_type TEXT NOT NULL DEFAULT 'application/json',
  response_delay_ms     INTEGER NOT NULL DEFAULT 0,
  hmac_secret           TEXT,
  hmac_algo             TEXT,
  hmac_header           TEXT,
  created_at            TEXT NOT NULL,
  expires_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id    TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  method         TEXT NOT NULL,
  path           TEXT NOT NULL,
  query          TEXT NOT NULL DEFAULT '{}',
  headers        TEXT NOT NULL DEFAULT '{}',
  body           TEXT,
  content_type   TEXT,
  ip             TEXT,
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  signature_valid INTEGER,
  received_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_endpoint_received
  ON requests(endpoint_id, received_at DESC);
