import { Buffer } from 'node:buffer';

const ENHANCE_PROMPT = '请对这张图片进行去水印处理并重绘增强清晰度。严格要求：不得擅自添笔修改图片内容、不得添加任何新元素、不得改变图片构图和布局，仅用于增强清晰度和去除水印。';

export default defineEventHandler(async (event) => {
  checkRateLimit(event);

  const formData = await readMultipartFormData(event);
  const file = formData?.find(f => f.name === 'file');
  if (!file?.data?.length) {
    throw createError({ statusCode: 400, message: '请上传图片文件' });
  }
  validateFileSize(file.data.length);

  const imageBase64 = Buffer.from(file.data).toString('base64');

  const resultBase64 = await enhanceImage(imageBase64, ENHANCE_PROMPT);

  return { imageBase64: resultBase64 };
});
