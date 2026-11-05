---
name: sbx-nestjs-secure-scaffold
description: Scaffold a new production-ready NestJS API (latest NestJS 12 on Node.js 26 LTS) with Clean Architecture and information-security best practices built in — optional PostgreSQL + TypeORM, JWT auth with rotating refresh tokens and scope validation, helmet/CORS/rate limiting, validated env, structured logs to Loki, Prometheus metrics, Grafana dashboards, Docker, docker-compose and GitHub Actions CI. Use this skill whenever the user wants to start, bootstrap, scaffold, initialize, generate or "create from scratch" a NestJS project, backend, API or microservice — even if they only say "new nest app", "boilerplate", "starter" or "project template".
---

# NestJS secure scaffold

Generates a complete NestJS API from a **tested template** (`assets/template`) with a deterministic generator (`scripts/scaffold.py`), then installs, configures and verifies it. Use the generator instead of writing files by hand: the template was validated end-to-end (lint, strict type-check, unit tests, e2e against real PostgreSQL 18, production boot, `npm audit`), and hand-written scaffolds drift from that.

The generated project follows the same rules as the `nestjs-clean-arch` skill (dependency rule, framework-free core, ports/adapters, `Either`, use cases with `useFactory`, in-memory unit tests) and ships `scripts/check-architecture.py` to enforce them in CI. Use that skill for every feature added afterwards.

## Step 1 — Ask before generating

Always ask **whether the API will use a database** — it changes what gets generated, so don't assume. Ask with the question tool if available (one call), otherwise in one short message. Also get the project name if it wasn't given (kebab-case; suggest one).

| Answer | `--database` | What you get |
|---|---|---|
| Yes, it stores data | `postgres` | PostgreSQL + TypeORM, migrations, **full auth module**: register, login, refresh with rotation + reuse detection, logout, `GET /auth/me`, scopes |
| No database | `none` | No persistence. **Resource-server auth**: validates JWTs issued by an external identity provider (signature, `iss`, `aud`, `exp`, pinned alg) + scope guard; example `GET /me` |

Everything else is always included (don't ask): Docker + compose, GitHub Actions CI + Dependabot, Swagger (off in production), health checks, pino logs → Loki/Grafana, Prometheus metrics → Grafana dashboard. If the user explicitly wants something removed, delete it after generating and keep the rest consistent (e.g. remove the Grafana services *and* their files).

If they ask for a database other than PostgreSQL, explain that the template is validated for PostgreSQL, generate with `postgres`, and then adapt `src/config/database.config.ts`, the migration SQL, the ORM column types, compose and CI — and re-run the full verification.

## Step 2 — Check versions

The template pins a validated set (NestJS 12.3, TypeScript 6.0, TypeORM 1.1, Jest 30, ESLint 10, Node 26 LTS). Before generating:

```bash
npm view @nestjs/core version
npm view @nestjs/cli version
```

- Same major (12.x): generate with `--latest` so minors/patches are current (it stays inside the validated majors and keeps TypeScript on `~6.0`, the newest supported by `@nestjs/cli`, `ts-jest` and `typescript-eslint`).
- A newer **major** exists: generate the validated set, tell the user, and offer an upgrade as a separate step — never jump majors silently.
- Node.js: the Active LTS line is the one to target (26 "Lithium" when this skill was written). If a newer LTS has been promoted, update `.nvmrc`, the `NODE_IMAGE` in the Dockerfile and `@types/node`.

## Step 3 — Generate

```bash
python3 <skill-dir>/scripts/scaffold.py --name <name> --out <dir> --database <postgres|none> [--latest]
```

Then:

```bash
cd <dir>
npm install
cp .env.example .env
```

Replace every `CHANGE_ME` in `.env` with real random values (for local development generate them, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`; never put real secrets in `.env.example`, chat output or commits). For `--database none`, `JWT_ACCESS_SECRET`, `JWT_ISSUER` and `JWT_AUDIENCE` must match the identity provider — say so to the user.

If the user's project should live in a git repository, `git init` and make sure `.env` is ignored (it is, via `.gitignore`).

## Step 4 — Verify (don't skip)

Run, in order, and fix anything that fails before reporting:

```bash
npm run lint
npm run typecheck
npm run arch:check
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

E2E tests boot the real `AppModule` with production hardening (`configureApp`). For `postgres` they need a database: `docker compose up -d postgres` (or any reachable PostgreSQL) and `DATABASE_URL=... npm run test:e2e`. If no database/Docker is available in your environment, say that e2e was not run rather than implying it passed.

Jest runs with `node --experimental-vm-modules` because NestJS 12 ships ESM and Node ≥ 24.9 loads it from CommonJS (`require(esm)`); that's the same setup as the official Nest 12 starter. If tests fail with "Must use import to load ES Module", the Node version is too old.

## Step 5 — Report

Tell the user briefly: which variant was generated, the versions used, what was verified (and what wasn't), how to run it (`npm run start:dev`, `docker compose up --build`, Grafana on `127.0.0.1:3001`), and the "before production" items from the README (TLS at the proxy + `TRUST_PROXY=true`, secret manager, image digest pinning, Redis-backed throttling when running several instances).

## What the template contains

```
src/
├── core/           Either, Entity, UniqueEntityId, DomainError (framework-free)
├── config/         zod env schema (fails fast, rejects placeholder secrets in prod), DB config, data-source for CLI
├── bootstrap/      configureApp (helmet, CORS allow-list, body limits, ValidationPipe, prefix) + Swagger
├── shared/         shared kernel (any module may import it)
│   ├── application/ Principal, AccessTokenVerifier & Clock ports
│   ├── infra/       JWT verifier (HS256 pinned, iss/aud), pino logging with redaction, TypeORM root, clock
│   ├── presentation/ global JwtAuthGuard (@Public opt-out), ScopesGuard (@RequireScopes), AllExceptionsFilter
│   └── shared.module.ts  guards order: Throttler → JWT → Scopes
└── modules/
    ├── auth/          (postgres) users + refresh tokens, Argon2id, rotation & reuse detection, 5 req/min throttle
    ├── me/            (none) example protected route
    ├── health/        /health/live, /health/ready (DB ping)
    └── observability/ Prometheus histogram per route template, /metrics behind METRICS_TOKEN
observability/      prometheus.yml, Alloy (docker logs → Loki), Grafana datasources + "API overview" dashboard
Dockerfile          multi-stage, non-root, tini, healthcheck
docker-compose.yml  api (+ migrate, postgres), prometheus, loki, alloy, grafana — hardened, internal ports on 127.0.0.1
.github/            CI (lint, typecheck, arch check, unit, e2e with Postgres service, build, audit, docker build), Dependabot
```

Details and rationale:
- `references/security.md` — every security control, mapped to OWASP API Security Top 10, plus the rules for new endpoints. Read it when the user asks about security, when adding auth-related features, or when reviewing generated code.
- `references/observability.md` — how logs and metrics reach Grafana, how to add a metric through a port, useful queries and alert ideas.

## Extending the generated project

New features follow the `nestjs-clean-arch` skill. On top of that, every new endpoint must:
- be authenticated by default — use `@Public()` only for genuinely public routes;
- declare `@RequireScopes(...)` with the narrowest scope (`<resource>:<action>`, e.g. `orders:read`);
- check **ownership** in the use case when it touches a user's resource (pass `principal.subject` in the input and return a `NotFound`/`Forbidden` domain error when it doesn't match — scopes alone don't prevent BOLA);
- bound every DTO field (`@MaxLength`, `@Max`, `@ArrayMaxSize`) and use `ParseUUIDPipe` for ids;
- return data only through a presenter (explicit field allow-list);
- add stricter `@Throttle` for expensive or abuse-prone operations.

Common requests and where to change things:
- **Asymmetric tokens / external IdP with JWKS**: replace `JwtAccessTokenVerifier` (shared/infra) with a JWKS-based adapter behind the same `AccessTokenVerifier` port; nothing else changes.
- **Refresh token in an httpOnly cookie** (browser clients): set it in the auth controller with `httpOnly`, `secure`, `sameSite: 'strict'`, `path: '/api/v1/auth'`, read it there, and add CSRF protection for the cookie-authenticated endpoints.
- **Multiple instances**: switch the throttler to Redis storage and keep refresh-token rotation in the database (already the case).
- **Fastify**: swap `@nestjs/platform-express` for `@nestjs/platform-fastify` + `@fastify/helmet`, and port `configureApp` and the metrics middleware; re-run the e2e suite.
