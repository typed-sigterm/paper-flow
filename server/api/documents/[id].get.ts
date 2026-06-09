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

  try {
    const document = await db.select().from(documents).where(eq(documents.id, id)).limit(1);

    if (document.length === 0) {
      throw createError({ statusCode: 404, message: '文档不存在' });
    }

    return { document: document[0] };
  } catch (error: any) {
    if (error.statusCode)
      throw error;
    throw createError({ statusCode: 500, message: error.message || '获取文档失败' });
  }
});
