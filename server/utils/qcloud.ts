import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { ofetch } from 'ofetch';
import { ocr as qcloudOcr } from 'tencentcloud-sdk-nodejs-ocr';

const config = useRuntimeConfig();

/**
 * OpenAI-compatible provider for Tencent Cloud TokenHub.
 *
 * Uses `.chat()` explicitly — TokenHub only exposes the Chat Completions
 * API, not the Responses API that `openai()` defaults to since AI SDK 5.
 */
export const tokenhub = createOpenAICompatible({
  name: 'tokenhub',
  baseURL: config.qcloudTokenhubBaseUrl,
  apiKey: config.qcloudTokenhubApiKey,
});

/**
 * Raw HTTP helper for non-OpenAI-compatible TokenHub endpoints
 * (e.g. /api/image/submit, /api/image/query).
 */
export function tokenhubRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return ofetch<T>(path, {
    method: 'POST',
    baseURL: config.qcloudTokenhubBaseUrl,
    headers: { Authorization: `Bearer ${config.qcloudTokenhubApiKey}` },
    body,
  });
}

export const ocr = new qcloudOcr.v20181119.Client({
  credential: {
    secretId: config.qcloudSecretId,
    secretKey: config.qcloudSecretKey,
  },
});
