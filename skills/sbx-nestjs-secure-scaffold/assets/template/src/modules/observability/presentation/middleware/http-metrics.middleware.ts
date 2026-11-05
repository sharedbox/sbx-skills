import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { HttpMetrics } from '../../application/ports/http-metrics';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: HttpMetrics) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      // route template (e.g. /api/v1/users/:id), never the raw URL: keeps label cardinality bounded
      const routePath = (req.route as { path?: string } | undefined)?.path;
      const route = routePath ? `${req.baseUrl}${routePath}` : 'unmatched';
      if (route === '/metrics') return;
      this.metrics.observeRequest({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationSeconds: Number(process.hrtime.bigint() - start) / 1e9,
      });
    });
    next();
  }
}
