import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, entityGlobs } from './database.config';
import { validateEnv } from './env.schema';

/** Used only by the TypeORM CLI (migrations). The app itself uses TypeOrmModule. */
const env = validateEnv(process.env);

export default new DataSource({ ...buildDataSourceOptions(env), entities: entityGlobs });
