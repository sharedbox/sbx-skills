import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
// #if db
import { AuthModule } from './modules/auth/auth.module';
// #else
import { MeModule } from './modules/me/me.module';
// #endif
import { HealthModule } from './modules/health/health.module';
import { ObservabilityModule } from './modules/observability/observability.module';
// #if db
import { DatabaseModule } from './shared/infra/database/database.module';
// #endif
import { LoggingModule } from './shared/infra/logging/logging.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    SharedModule,
    // #if db
    DatabaseModule,
    AuthModule,
    // #else
    MeModule,
    // #endif
    HealthModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
