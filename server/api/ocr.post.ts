import { Buffer } from 'node:buffer';
import { ocr } from '../utils/qcloud';

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const formData = await readMultipartFormData(event);
  const file = formData?.find(f => f.name === 'file');
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, message: '请上传图片文件' });
  }
  validateFileSize(file.data.length);

  return await ocr.QuestionSplitOCR({
    ImageBase64: Buffer.from(file.data).toString('base64'),
    UseNewModel: false,
  });
});
