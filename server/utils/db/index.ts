/* eslint-disable antfu/no-top-level-await */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-sqlite';
import * as schema from './schema';

const config = useRuntimeConfig();
const dbFile = resolve(config.dataDir, 'db.sqlite');
try {
  await access(dbFile);
} catch {
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(dbFile, '');
}

export const db = drizzle(dbFile, { schema });
