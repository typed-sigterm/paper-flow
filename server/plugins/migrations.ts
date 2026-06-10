import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { db } from '#server/utils/db';
import { root } from '#server/utils/platform';

export default defineNitroPlugin(() => {
  migrate(db, {
    migrationsFolder: join(root, 'migrations'),
  });
});
