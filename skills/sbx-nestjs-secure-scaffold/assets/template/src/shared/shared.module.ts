import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypedConfigService } from '../config/typed-config';
import { AccessTokenVerifier } from './application/ports/access-token-verifier';
import { Clock } from './application/ports/clock';
import { JwtAccessTokenVerifier } from './infra/security/jwt-access-token-verifier';
import { SystemClock } from './infra/time/system-clock';
import { AllExceptionsFilter } from './presentation/filters/all-exceptions.filter';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { ScopesGuard } from './presentation/guards/scopes.guard';

/** Shared kernel composition root: cross-cutting security for every module. */
@Global()
@Module({
  imports: [
    JwtModule.register({}), // secrets/options are passed explicitly on every sign/verify
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: TypedConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
          },
        ],
      }),
    }),
  ],
  providers: [
    { provide: AccessTokenVerifier, useClass: JwtAccessTokenVerifier },
    { provide: Clock, useClass: SystemClock },
    // order matters: rate limit -> authenticate -> authorize
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [AccessTokenVerifier, Clock, JwtModule],
})
export class SharedModule {}
