import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HttpMetrics } from './application/ports/http-metrics';
import { MetricsExporter } from './application/ports/metrics-exporter';
import { PrometheusMetrics } from './infra/prometheus/prometheus-metrics';
import { MetricsController } from './presentation/controllers/metrics.controller';
import { HttpMetricsMiddleware } from './presentation/middleware/http-metrics.middleware';

@Module({
  controllers: [MetricsController],
  providers: [
    PrometheusMetrics,
    { provide: HttpMetrics, useExisting: PrometheusMetrics },
    { provide: MetricsExporter, useExisting: PrometheusMetrics },
  ],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
