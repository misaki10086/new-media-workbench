import { SequelizeStorage, Umzug } from 'umzug';
import type { QueryInterface } from 'sequelize';
import { sequelize } from '../config/database.js';
import { initialSchema } from '../migrations/202609040001-initial-schema.js';
import { platformOauth } from '../migrations/202609050001-platform-oauth.js';

export const migrator = new Umzug<QueryInterface>({
  migrations: [initialSchema, platformOauth],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'SequelizeMeta' }),
  logger: console,
});
