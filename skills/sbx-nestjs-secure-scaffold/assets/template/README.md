# __APP_NAME__

NestJS __NEST_VERSION__ API on Node.js 26 LTS, organised by Clean Architecture
(`domain → application ← infra / presentation`) with security on by default.

## Quick start

```bash
nvm use                       # Node 26 LTS (.nvmrc)
cp .env.example .env          # then replace every CHANGE_ME (openssl rand -base64 48)
npm ci
# #if db
docker compose up -d postgres
npm run migration:run
# #endif
npm run start:dev             # http://localhost:3000/docs (Swagger, dev only)
```

Full stack with observability:

```bash
docker compose up --build
```

| Service    | URL                              | Notes                                   |
|------------|----------------------------------|-----------------------------------------|
| API        | http://localhost:3000/api/v1     | `/health/live`, `/health/ready`         |
| Grafana    | http://127.0.0.1:3001            | dashboard "__APP_NAME__ — API overview" |
| Prometheus | http://127.0.0.1:9090            | scrapes `/metrics` with `METRICS_TOKEN` |
| Loki       | http://127.0.0.1:3100            | logs shipped by Grafana Alloy           |

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | watch mode with pretty logs |
| `npm run lint` / `typecheck` | ESLint (type-aware) / `tsc --noEmit` |
| `npm test` / `test:e2e` | unit tests (no DB) / end-to-end tests |
| `npm run arch:check` | fails on Clean Architecture violations |
# #if db
| `npm run migration:generate --name=<Name>` / `migration:run` / `migration:revert` | TypeORM migrations |
# #endif

## Architecture

```
src/
├── core/        Either, Entity, DomainError — framework-free
├── config/      env schema (validated at boot), DB config
├── bootstrap/   app hardening + Swagger (shared by main.ts and e2e tests)
├── shared/      shared kernel: auth guards, scopes, exception filter, logging
└── modules/<feature>/{domain,application,infra,presentation}/ + <feature>.module.ts
```

Rules: the core never imports NestJS/TypeORM; business errors are returned as `Either`;
use cases are wired with `useFactory`; every use case has unit tests with in-memory doubles.
`npm run arch:check` enforces the dependency rule in CI.

## Security

- **Authentication by default**: a global guard protects every route; opt out with `@Public()`.
- **Authorization by scope**: `@RequireScopes('orders:read')` — the token must carry all listed scopes (`scope` claim, space-delimited).
- **JWT**: HS256 pinned, issuer and audience validated, short-lived (`JWT_ACCESS_TTL_SECONDS`).
# #if db
- **Refresh tokens**: opaque 256-bit, stored as SHA-256 only, rotated on every use; replaying a used token revokes the whole session family (logged as `refresh_token_reuse_detected`).
- **Passwords**: Argon2id (OWASP parameters), 12–128 chars, generic errors and timing equalisation against user enumeration.
# #else
- **Tokens are issued by your identity provider**; this API only validates them. Configure `JWT_ACCESS_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` to match it.
# #endif
- **Rate limiting**: global limit + 5 req/min on auth endpoints (use a Redis throttler storage when running several instances).
- **Input**: DTO whitelisting (`forbidNonWhitelisted`), 100 kb body limit, validated env (app refuses to boot with weak/missing secrets).
- **Output**: helmet headers, strict CORS allow-list, no stack traces, presenters as explicit field allow-lists.
- **Logs**: structured JSON (pino), request ids, credentials redacted before they reach Loki.
- **Metrics**: `/metrics` requires `METRICS_TOKEN`; health endpoints expose no internals.
- **Supply chain / runtime**: `npm audit` + Dependabot in CI, multi-stage non-root Docker image, read-only FS, `no-new-privileges`, dropped capabilities, internal services bound to 127.0.0.1.

Before production: terminate TLS at a proxy and set `TRUST_PROXY=true`, pin image digests,
store secrets in a secret manager, and review `docs` exposure (`SWAGGER_ENABLED=false`).
