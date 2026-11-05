# Observability: logs and metrics in Grafana

```
NestJS (pino JSON → stdout) ──docker logs──► Alloy ──► Loki ──┐
NestJS /metrics (Bearer METRICS_TOKEN) ◄── Prometheus ────────┼──► Grafana (provisioned datasources + "API overview")
```

Start everything with `docker compose up --build`; Grafana on http://127.0.0.1:3001 (admin password from `.env`).

## Logs

- Format: one JSON object per line; `level` is a string label in production (`info`, `warn`, `error`) so Alloy can turn it into a Loki label. Development uses `pino-pretty`.
- Alloy keeps only containers labelled `logging=alloy` and adds labels `service`, `container`, `level`. High-cardinality fields (request id, user id) stay inside the line — query them with `| json`.
- Useful LogQL:
  - all API logs: `{service="api"}`
  - errors: `{service="api"} | json | level=~"error|fatal"`
  - one request: `{service="api"} | json | req_id="<id>"` (the id is returned in `X-Request-Id` and in every error body)
  - security events: `{service="api"} |= "refresh_token_reuse_detected"`
- Outside Docker (Kubernetes, VMs), point Alloy (or your collector) at the pod/container stdout — the app does not need to change.

## Metrics

- `http_request_duration_seconds` histogram, labels `method`, `route` (template, e.g. `/api/v1/orders/:id` — never the raw URL, to keep cardinality bounded), `status_code`; plus Node.js/process defaults (event loop lag, heap, GC, CPU) from `@prometheus-io/client` (the maintained successor of `prom-client`).
- `/metrics` is excluded from auth (`@Public`) but protected by `MetricsTokenGuard`; Prometheus sends the token from a Docker secret (`credentials_file`).
- Useful PromQL (already on the dashboard):
  - RPS by route: `sum by (route) (rate(http_request_duration_seconds_count[5m]))`
  - p95: `histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))`
  - 5xx ratio: `sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))`
  - security signals: `sum by (status_code) (rate(http_request_duration_seconds_count{status_code=~"401|403|429"}[5m]))`

## Adding a business metric (keep Clean Architecture)

1. Port in the feature's `application/ports/` (e.g. `OrderMetrics { orderPlaced(amountCents: number): void }`).
2. Use case receives the port and calls it after success.
3. Adapter in the feature's `infra/` implements it with a `Counter`/`Histogram` registered on the shared `Registry` — expose the registry from `PrometheusMetrics` (observability module exports it) instead of creating a second one.
4. Bind in the feature module. Unit tests use a fake that records calls.
Keep label values bounded (no ids, e-mails or free text as labels).

## Alert ideas (Prometheus/Grafana alerting)

- 5xx ratio > 2 % for 5 min.
- p95 latency of a route > SLO for 10 min.
- 401/429 rate spike (credential stuffing): rate > N× baseline.
- Any `refresh_token_reuse_detected` log line (Loki alert rule).
- `/health/ready` failing (blackbox exporter or orchestrator probes).
