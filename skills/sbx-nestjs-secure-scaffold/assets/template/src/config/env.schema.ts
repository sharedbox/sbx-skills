import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
const secret = z.string().min(32, 'must be at least 32 characters');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    CORS_ORIGINS: csv.default([]),
    TRUST_PROXY: bool.default(false),
    SWAGGER_ENABLED: bool.optional(),

    RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),

    METRICS_TOKEN: secret,

    JWT_ACCESS_SECRET: secret,
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    // #if db
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    DEFAULT_USER_SCOPES: csv.default(['profile:read']),

    DATABASE_URL: z.url(),
    DATABASE_SSL: bool.default(false),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // #endif
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: '"*" is not allowed in production' });
    }
    for (const key of ['METRICS_TOKEN', 'JWT_ACCESS_SECRET'] as const) {
      if (env[key].includes('CHANGE_ME')) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'placeholder secret used in production' });
      }
    }
    // #if db
    if (!env.DATABASE_SSL && !/@(localhost|127\.0\.0\.1|postgres)[:/]/.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SSL'],
        message: 'TLS is required for remote databases in production',
      });
    }
    // #endif
  });

export type Env = z.infer<typeof envSchema>;

/** Fails fast at boot: the app never starts with missing or weak configuration. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const isSwaggerEnabled = (env: Pick<Env, 'SWAGGER_ENABLED' | 'NODE_ENV'>): boolean =>
  env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production';
