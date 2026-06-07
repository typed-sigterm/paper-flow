import { Buffer } from 'node:buffer';

interface SubmitResponse {
  id: string
  request_id: string
  object: string
  created_at: number
  status: string
}

interface QueryResponse {
  request_id: string
  object: string
  created_at: number
  completed_at: number
  status: string
  data?: { url: string, revised_prompt?: string }[]
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // 60s max
const { redrawFigureModel } = useRuntimeConfig();

async function submitImageEnhance(imageDataUrl: string, prompt: string) {
  const res = await tokenhub.request<SubmitResponse>({
    method: 'post',
    path: '/api/image/submit',
    body: {
      model: redrawFigureModel,
      prompt,
      images: [imageDataUrl],
      logo_add: 0,
    },
  });
  if (!res.id)
    throw createError({ statusCode: 502, message: '提交任务失败' });
  return res.id;
}

function queryTask(taskId: string): Promise<QueryResponse> {
  return tokenhub.request({
    method: 'post',
    path: '/api/image/query',
    body: { model: redrawFigureModel, id: taskId },
  });
}

async function pollUntilDone(taskId: string): Promise<string> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const res = await queryTask(taskId);

    if (res.status === 'completed') {
      const imageUrl = res.data?.[0]?.url;
      if (!imageUrl)
        throw createError({ statusCode: 502, message: '上游未返回图片地址' });
      return imageUrl;
    }

    if (res.status === 'failed')
      throw createError({ statusCode: 502, message: '上游任务失败' });
  }

  throw createError({ statusCode: 504, message: '上游任务超时' });
}

export async function enhanceImage(imageBase64: string, prompt: string): Promise<string> {
  // eslint-disable-next-line prefer-template
  const imageDataUrl = 'data:image/png;base64,' + imageBase64; // rope string
  const taskId = await submitImageEnhance(imageDataUrl, prompt);
  const imageUrl = await pollUntilDone(taskId);

  const arrayBuffer = await $fetch<ArrayBuffer>(imageUrl, { responseType: 'arrayBuffer' });
  return Buffer.from(arrayBuffer).toString('base64');
}
