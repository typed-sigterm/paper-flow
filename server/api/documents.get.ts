import { db } from '#server/utils/db';
import { documents } from '#server/utils/db/schema';

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  try {
    const allDocuments = await db.select().from(documents);
    return { documents: allDocuments };
  } catch (error: any) {
    throw createError({ statusCode: 500, message: error.message || '获取文档列表失败' });
  }
});
