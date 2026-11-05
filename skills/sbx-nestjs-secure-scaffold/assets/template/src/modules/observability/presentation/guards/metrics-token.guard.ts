import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../../../config/env.schema';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** /metrics exposes internals: only Prometheus, holding METRICS_TOKEN, may read it. */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.expected = digest(config.get('METRICS_TOKEN', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !timingSafeEqual(digest(token), this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
