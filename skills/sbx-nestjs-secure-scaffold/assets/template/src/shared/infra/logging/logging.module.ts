import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { TypedConfigService } from '../../../config/typed-config';

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Never let credentials or personal secrets reach the logs (and therefore Loki/Grafana). */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                req.url === '/metrics' || (req.url ?? '').startsWith('/health'),
            },
            serializers: {
              // log only what is needed for tracing; no bodies, no query strings
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                path: req.url.split('?')[0],
              }),
            },
            ...(isDev
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : { formatters: { level: (label: string) => ({ level: label }) } }),
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
