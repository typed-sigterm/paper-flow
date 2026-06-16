import type { UUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { readBlob } from '#server/utils/blobs';
import { db } from '#server/utils/db';
import { blobs } from '#server/utils/db/schema';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as UUID | undefined;
  if (!id) {
    throw createError({ statusCode: 400, message: '缺少 blob ID' });
  }

  const rows = await db.select().from(blobs).where(eq(blobs.id, id)).limit(1);
  if (rows.length === 0) {
    throw createError({ statusCode: 404, message: '文件不存在' });
  }

  const blob = rows[0]!;
  const content = await readBlob(blob.hash);
  if (!content) {
    throw createError({ statusCode: 404, message: '文件数据丢失' });
  }

  setResponseHeader(event, 'Content-Type', blob.mimeType);
  setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable');
  return content;
});
