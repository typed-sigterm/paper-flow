import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/utils/db/schema.ts',
  out: './migrations',
});
