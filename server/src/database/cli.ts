import { sequelize } from '../models/index.js';
import { migrator } from './migrator.js';
import { seedAdmin, unseedAdmin } from './seed.js';

const command = process.argv[2] ?? 'up';

async function run(): Promise<void> {
  await sequelize.authenticate();
  switch (command) {
    case 'up':
      await migrator.up();
      break;
    case 'down':
      await migrator.down();
      break;
    case 'seed':
      await seedAdmin();
      break;
    case 'unseed':
      await unseedAdmin();
      break;
    case 'init':
      await migrator.up();
      await seedAdmin();
      break;
    default:
      throw new Error(`Unknown database command: ${command}`);
  }
}

async function bootstrap(): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

void bootstrap();
