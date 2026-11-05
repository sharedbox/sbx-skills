import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { setupSwagger } from './bootstrap/swagger';
import { isSwaggerEnabled } from './config/env.schema';
import { TypedConfigService } from './config/typed-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false, // re-registered with explicit size limits in configureApp
  });
  const config = app.get<TypedConfigService>(ConfigService);

  configureApp(app, config);

  if (
    isSwaggerEnabled({
      SWAGGER_ENABLED: config.get('SWAGGER_ENABLED', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    })
  ) {
    setupSwagger(app, '__APP_NAME__');
  }

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
