import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Env } from './env.schema';

const modulesDir = join(__dirname, '..', 'modules');

export const entityGlobs = [join(modulesDir, '*', 'infra', 'database', 'typeorm', 'entities', '*.orm-entity.{ts,js}')];
export const migrationGlobs = [join(modulesDir, '*', 'infra', 'database', 'typeorm', 'migrations', '*.{ts,js}')];

export function buildDataSourceOptions(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_SSL' | 'DATABASE_POOL_MAX'>,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    synchronize: false, // schema changes only through reviewed migrations
    migrationsRun: false,
    migrations: migrationGlobs,
    logging: ['error'],
    extra: {
      max: env.DATABASE_POOL_MAX,
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 10_000,
    },
  };
}
