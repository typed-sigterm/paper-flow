import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { file } from 'empathic/find';
import { db } from '#server/utils/db';

export default defineNitroPlugin(async () => {
  const root = dirname(file('package.json')!);
  migrate(db, {
    migrationsFolder: resolve(root, 'migrations'),
  });
});
