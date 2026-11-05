import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { TypedConfigService } from '../config/typed-config';

export const GLOBAL_PREFIX = 'api/v1';
const BODY_LIMIT = '100kb';

/**
 * Security and platform hardening shared by main.ts and the e2e tests,
 * so tests exercise exactly what production runs.
 */
export function configureApp(app: NestExpressApplication, config: TypedConfigService): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();

  app.disable('x-powered-by');
  if (config.get('TRUST_PROXY', { infer: true })) {
    // needed for correct client IPs in rate limiting / logs behind a load balancer
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: false });

  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
    maxAge: 600,
  });

  app.setGlobalPrefix(GLOBAL_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
      // do not echo submitted values back in validation errors
      validationError: { target: false, value: false },
    }),
  );

  app.enableShutdownHooks();
}
