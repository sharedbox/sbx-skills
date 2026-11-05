import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // in production variables come from the environment / secret manager, never from a file
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
  ],
})
export class AppConfigModule {}
