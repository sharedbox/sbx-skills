import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

/** ConfigService typed against the validated schema: `config.get('PORT', { infer: true })`. */
export type TypedConfigService = ConfigService<Env, true>;
