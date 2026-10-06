# Changelog

All notable changes to Hookscope will be documented in this file.

Format: [Conventional Commits](https://www.conventionalcommits.org/)

---

## [Unreleased]

### Phase 1 — Database dan Pembuatan Endpoint

- `feat(db): add libsql client and schema migration` — `schema.sql` (endpoints + requests + index), auto-migrate saat start dengan `:memory:` fallback untuk test
- `feat(api): bearer token auth middleware` — `requireManageToken` preHandler, return 401 tanpa/salah token
- `feat(api): POST /api/endpoints and GET /api/endpoints/:id` — buat endpoint (nanoid 12), return `id`, `manage_token`, `hook_url`, `expires_at`; GET endpoint dengan HMAC secret di-mask
- `test: endpoint creation and bearer token auth` — 5 test kasus: create, get valid, get tanpa token, get token salah, mask secret

### Phase 0 — Setup

- `chore: init monorepo` — root package.json dengan npm workspaces
- `chore: setup server` — Fastify + TypeScript + Vitest + ESLint + Prettier
- `chore: setup web` — Vite + React + TypeScript + Tailwind CSS
- `ci: add github actions workflow` — lint + test pada push/PR
- `docs: add readme skeleton` — README dengan fitur, setup, arsitektur
