import { OpenAI } from 'openai';
import { ocr as qcloudOcr } from 'tencentcloud-sdk-nodejs-ocr';

const config = useRuntimeConfig();

export const tokenhub = new OpenAI({
  baseURL: config.qcloudTokenhubBaseUrl,
  apiKey: config.qcloudTokenhubApiKey,
});

export const ocr = new qcloudOcr.v20181119.Client({
  credential: {
    secretId: config.qcloudSecretId,
    secretKey: config.qcloudSecretKey,
  },
});
