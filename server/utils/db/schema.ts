import type { UUID } from 'node:crypto';
import type { DocumentContent, DocumentStatus } from '#shared/utils/models';
import { sql } from 'drizzle-orm';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

function buildCreatedAtColumn() {
  return integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(datetime('now'))`);
}

function buildCommonFields() {
  return {
    createdAt: buildCreatedAtColumn(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(datetime('now'))`)
      .$onUpdateFn(() => sql`(datetime('now'))`),
  };
}

export const blobs = sqliteTable('blobs', {
  id: text('id').$type<UUID>().primaryKey(),
  /** BLAKE3 content hash (hex) */
  hash: text('hash').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  /** File size in bytes */
  size: integer('size').notNull(),
  createdAt: buildCreatedAtColumn(),
});

export const documents = sqliteTable('documents', {
  id: text('id').$type<UUID>().primaryKey(),
  title: text('title').notNull(),
  originalFile: text('original_file').$type<UUID>().notNull(),
  content: blob('content', { mode: 'json' }).$type<DocumentContent>().notNull(),
  status: text('status').$type<DocumentStatus>().notNull(),
  error: text('error'),
  ...buildCommonFields(),
});
