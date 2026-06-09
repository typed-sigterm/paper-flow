import type { UUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '#server/utils/db';
import { documents } from '#server/utils/db/schema';

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const id = getRouterParam(event, 'id') as UUID | undefined;
  if (!id) {
    throw createError({ statusCode: 400, message: '缺少文档 ID' });
  }

  const deleted = await db.delete(documents).where(eq(documents.id, id)).returning();
  if (!deleted.length) {
    throw createError({ statusCode: 404, message: '文档不存在' });
  }

  return { success: true };
});
