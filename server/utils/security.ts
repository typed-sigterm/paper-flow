import type { H3Event } from 'h3';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Validate uploaded file size. Throws 413 if too large.
 */
export function validateFileSize(bytes: number, maxBytes = MAX_FILE_SIZE) {
  if (bytes > maxBytes) {
    throw createError({
      statusCode: 413,
      message: '文件过大，请压缩后重试',
    });
  }
}

/**
 * Basic rate limiting using a simple in-memory sliding window.
 * Not production-grade for multi-instance, but sufficient for single-server basic security.
 */
const requestLog = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // max requests per window

export function checkRateLimit(event: H3Event) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const timestamps = (requestLog.get(ip) ?? []).filter(t => t > windowStart);
  timestamps.push(now);
  requestLog.set(ip, timestamps);

  if (timestamps.length > RATE_LIMIT_MAX) {
    throw createError({
      statusCode: 429,
      message: '请求过于频繁，请稍后再试',
    });
  }
}
