import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  // #if db
  TypeOrmHealthIndicator,
  // #endif
} from '@nestjs/terminus';
import { Public } from '../../../../shared/presentation/decorators/public.decorator';

@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    // #if db
    private readonly db: TypeOrmHealthIndicator,
    // #endif
  ) {}

  /** Liveness: the process is up. No dependencies, so it never cascades failures. */
  @Get('live')
  @HealthCheck()
  live(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /** Readiness: dependencies reachable; load balancers route traffic only when this is up. */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      // #if db
      () => this.db.pingCheck('database', { timeout: 1500 }),
      // #endif
    ]);
  }
}
