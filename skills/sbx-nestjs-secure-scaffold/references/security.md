# Security controls in the scaffold

Mapped to the OWASP API Security Top 10 (2023). "Where" points to the generated file.

## Contents
1. Control matrix (OWASP API Top 10)
2. Authentication design
3. Refresh-token rotation and reuse detection
4. Configuration and secrets
5. Transport, headers and input
6. Logging, monitoring and privacy
7. Container and supply chain
8. Rules for new code
9. Known limits / before production

---

## 1. Control matrix

| OWASP API risk | Control | Where |
|---|---|---|
| API1 Broken Object Level Authorization | Use cases receive `principal.subject` and check ownership; scopes are not enough | rule for new code (§8) |
| API2 Broken Authentication | Global `JwtAuthGuard` (deny by default), HS256 pinned, `iss`/`aud`/`exp` validated, Argon2id, generic auth errors, timing equalisation, refresh rotation + reuse detection, 5 req/min on auth routes | `shared/presentation/guards/jwt-auth.guard.ts`, `shared/infra/security/jwt-access-token-verifier.ts`, `modules/auth/**` |
| API3 Broken Object Property Level Authorization | DTO whitelisting (`whitelist` + `forbidNonWhitelisted`), presenters as explicit allow-lists (no `passwordHash`), scopes never self-assigned at sign-up | `bootstrap/configure-app.ts`, `*/presentation/presenters/*` , `RegisterUserUseCase` |
| API4 Unrestricted Resource Consumption | Global throttler + stricter auth throttle, 100 kb body limit, `@MaxLength` on every string, password max 128 (hash DoS), DB `statement_timeout`, pool size | `shared/shared.module.ts`, `configure-app.ts`, DTOs, `config/database.config.ts` |
| API5 Broken Function Level Authorization | `@RequireScopes()` + `ScopesGuard` (all scopes required), `@Public()` explicit opt-out | `shared/presentation/**` |
| API6 Unrestricted Access to Sensitive Business Flows | Throttle per route; add business-specific limits per flow | auth controller, §8 |
| API7 SSRF | No outbound calls in template; new adapters must allow-list hosts | §8 |
| API8 Security Misconfiguration | helmet, CORS allow-list (no `*` in prod), `x-powered-by` off, Swagger off in prod, generic 500s, env validation that refuses placeholder secrets and plain-text remote DB in prod | `configure-app.ts`, `config/env.schema.ts`, `AllExceptionsFilter` |
| API9 Improper Inventory Management | Versioned prefix `/api/v1`, OpenAPI document generated from code, health/metrics excluded from docs | `configure-app.ts`, `bootstrap/swagger.ts` |
| API10 Unsafe Consumption of APIs | Validate data from third parties in the adapter, map to domain types | §8 |

## 2. Authentication design

- **Access token**: JWT, HS256, 15 min default (`JWT_ACCESS_TTL_SECONDS`, max 1 h), claims `sub`, `scope` (space-delimited), `iss`, `aud`, `jti`, `exp`. The algorithm is pinned on verify, so `alg: none` and algorithm-confusion attacks fail.
- **Verification is a port** (`AccessTokenVerifier`), so the same guard works for tokens issued by this API (postgres variant) or by an external IdP (none variant). Moving to RS256/EdDSA/JWKS means only a new adapter.
- **Guards order**: `ThrottlerGuard` → `JwtAuthGuard` → `ScopesGuard`. Rate limiting runs even for unauthenticated calls.
- **401 vs 403**: 401 + `WWW-Authenticate: Bearer` when the token is missing/invalid; 403 `INSUFFICIENT_SCOPE` when valid but under-privileged.
- **Passwords**: Argon2id (m = 19 MiB, t = 2, p = 1, OWASP baseline), length 12–128, no composition rules (NIST 800-63B). Login returns the same `INVALID_CREDENTIALS` for unknown user, wrong password and inactive account, and burns a dummy hash when the user doesn't exist.

## 3. Refresh tokens

- Opaque, 256-bit random secret; wire format `<uuid>.<secret>`. Only `sha256(secret)` is stored; comparison is constant-time.
- **Rotation**: each refresh revokes the presented token (`revoked_at`, `replaced_by_id`) and issues a new one in the same `family_id`.
- **Reuse detection**: presenting an already-revoked token revokes the whole family (attacker and victim are both logged out) and logs `refresh_token_reuse_detected` at `warn` — visible in the Grafana "Security events" panel. The client only sees the generic `INVALID_REFRESH_TOKEN`.
- **Logout** revokes the family and is idempotent (never reveals whether a token existed).
- Deactivated users: refresh fails and revokes the family.
- Known race: two concurrent refreshes with the same token can both succeed before either commits. If that matters, add a conditional update (`UPDATE ... WHERE id = $1 AND revoked_at IS NULL`) and treat 0 affected rows as reuse.

## 4. Configuration and secrets

- `config/env.schema.ts` (zod) validates everything at boot; the app does not start with missing/short secrets. In production it also rejects `CHANGE_ME` placeholders, `CORS_ORIGINS=*`, and a remote database without TLS.
- `.env` is for local development only and is git/docker-ignored; in production `.env` files are not even read (`ignoreEnvFile`). Use the platform's secret manager.
- Separate secrets per purpose: `JWT_ACCESS_SECRET`, `METRICS_TOKEN`, DB password, Grafana admin password. Rotate the JWT secret by deploying a verifier that accepts old + new for one access-token TTL.

## 5. Transport, headers and input

- TLS terminates at the proxy/load balancer; set `TRUST_PROXY=true` there so client IPs (rate limiting, logs) are correct. HSTS is sent by helmet.
- CORS: explicit origins, no credentials, limited methods/headers; empty list disables CORS.
- `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, `transform`; validation errors don't echo values back.
- Body parsers registered with explicit 100 kb limits (JSON and urlencoded only).

## 6. Logging, monitoring and privacy

- pino JSON logs with a request id (accepts a safe incoming `X-Request-Id`, otherwise generates one, echoes it in the response and in error bodies).
- Request serializer logs only id, method and path — no headers, bodies or query strings. Redaction is a second line of defence for `authorization`, `cookie`, `password`, `token`, `refreshToken`, `accessToken`.
- Health and metrics requests are not logged (noise). `/metrics` needs `METRICS_TOKEN` (constant-time comparison); Prometheus reads it from a Docker secret.
- Grafana: anonymous access and sign-up disabled, admin password required; Prometheus, Loki, Alloy and Grafana bind to 127.0.0.1.

## 7. Container and supply chain

- Multi-stage build, `npm ci`, `npm prune --omit=dev`, runs as `node`, app files root-owned (read-only for the process), `tini` as PID 1, `HEALTHCHECK`.
- Compose: `read_only`, `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`.
- CI: least-privilege `permissions: contents: read`, `persist-credentials: false`, `npm audit --omit=dev --audit-level=high`, architecture check, Docker build; Dependabot for npm, Actions and Docker.
- Pin image digests and Action SHAs for high-assurance environments.
- Alloy mounts the Docker socket read-only to discover containers — keep Alloy internal; in Kubernetes use its pod log discovery instead.

## 8. Rules for new code

1. Every route authenticated unless `@Public()`; every authenticated route declares `@RequireScopes()` with the narrowest scope.
2. Ownership checks live in the use case (input carries `principal.subject`); return a domain error, mapped to 404 (avoid confirming existence) or 403.
3. Bound every input: `@MaxLength`, `@Max`, `@ArrayMaxSize`, `@IsUUID`/`ParseUUIDPipe`; pagination with a max page size.
4. Responses only through presenters; never return entities or ORM models.
5. Expected failures are `Either` + domain errors mapped in the module's error mapper; never leak internals in messages.
6. Outbound HTTP adapters: allow-list hosts, timeouts, response size limits, validate payloads before mapping.
7. Raw SQL only with parameters (`$1`), never string concatenation.
8. Security-relevant events (`*_reuse_detected`, permission denials on sensitive flows, admin actions) logged at `warn` with an `event` field and no personal data.
9. New secrets go into `env.schema.ts` with `min(32)` and the production placeholder check.

## 9. Before production

- TLS at the edge, `TRUST_PROXY=true`, HSTS preload if applicable.
- Secret manager; rotate secrets; distinct values per environment.
- Redis storage for the throttler when running more than one instance.
- Pin image digests; run a container scanner (e.g. Trivy) and a SAST tool (e.g. CodeQL) in CI.
- Decide account-lockout / CAPTCHA policy for login beyond rate limiting.
- Back up PostgreSQL; enable `DATABASE_SSL=true` with CA verification.
