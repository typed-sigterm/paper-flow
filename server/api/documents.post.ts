import type { UUID } from 'node:crypto';
import type { DocumentContent, DocumentPart } from '#shared/utils/models';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { storeBlob } from '#server/utils/blobs';
import { db } from '#server/utils/db';
import { documents } from '#server/utils/db/schema';
import { enhanceParts } from '#server/utils/enhance-parts';
import { ocrResultToParts } from '#server/utils/ocr-convert';
import { ocr } from '#server/utils/qcloud';

async function processDocument(id: UUID, files: { data: Buffer, type: string }[]): Promise<void> {
  try {
    await db.update(documents).set({ status: 'processing' }).where(eq(documents.id, id));

    // OCR each image and combine results
    const allParts: DocumentPart[] = [];
    for (const f of files) {
      const result = await ocr.QuestionSplitOCR({
        ImageBase64: f.data.toString('base64'),
        UseNewModel: false,
      });
      allParts.push(...ocrResultToParts(result));
    }

    const content: DocumentContent = { schema: 1, parts: allParts };
    await enhanceParts(content.parts as DocumentPart[]);
    await db.update(documents).set({ content, status: 'done' }).where(eq(documents.id, id));
  } catch (e: any) {
    await db.update(documents).set({ status: 'error', error: e?.message || '处理失败' }).where(eq(documents.id, id));
  }
}

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const documentId = randomUUID();
  const title = `文档 ${new Date().toLocaleString()}`;

  const formData = await readMultipartFormData(event);
  const files = formData?.filter(f => f.name === 'files') ?? [];
  if (!files.length) {
    throw createError({ statusCode: 400, message: '请上传文件' });
  }
  for (const f of files) validateFileSize(f.data.length);

  // Store the first file as the original
  const blobId = await storeBlob(Buffer.from(files[0]!.data), files[0]!.type || 'image/png') as UUID;

  await db.insert(documents).values({
    id: documentId,
    title,
    originalFile: blobId,
    content: { schema: 1, parts: [] },
    status: 'pending',
  });

  // OCR + enhance in background — doesn't block the response
  processDocument(documentId, files.map(f => ({ data: Buffer.from(f.data), type: f.type || 'image/png' })));

  return { documentId, status: 'pending' as const };
});
