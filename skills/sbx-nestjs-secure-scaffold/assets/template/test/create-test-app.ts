import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
// #if db
import { DataSource } from 'typeorm';
// #endif
import { AppModule } from '@/app.module';
import { configureApp } from '@/bootstrap/configure-app';
import { TypedConfigService } from '@/config/typed-config';

/** Boots the real AppModule with the same hardening as production (configureApp). */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true, bodyParser: false });
  configureApp(app, app.get<TypedConfigService>(ConfigService));
  await app.init();
  // #if db
  const dataSource = app.get(DataSource);
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  // #endif
  return app;
}
