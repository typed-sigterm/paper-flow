import { Buffer } from 'node:buffer';
import { storeBlob } from '#server/utils/blobs';

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const formData = await readMultipartFormData(event);
  const file = formData?.find(f => f.name === 'file');
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, message: '请上传图片文件' });
  }
  validateFileSize(file.data.length);

  const mimeType = file.type || 'image/png';
  const blobId = await storeBlob(Buffer.from(file.data), mimeType);

  return { blobId };
});
