import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry } from '@prometheus-io/client';
import { HttpMetrics, HttpRequestObservation } from '../../application/ports/http-metrics';
import { MetricsExporter } from '../../application/ports/metrics-exporter';

@Injectable()
export class PrometheusMetrics extends HttpMetrics implements MetricsExporter {
  private readonly registry = new Registry();
  private readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;

  constructor() {
    super();
    this.registry.setDefaultLabels({ app: '__APP_NAME__' });
    collectDefaultMetrics({ register: this.registry });
    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  observeRequest({ method, route, statusCode, durationSeconds }: HttpRequestObservation): void {
    this.httpDuration.observe({ method, route, status_code: String(statusCode) }, durationSeconds);
  }

  export(): Promise<string> {
    return this.registry.metrics();
  }
}
