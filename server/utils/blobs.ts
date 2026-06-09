import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { hash } from 'blake3-jit';
import { eq } from 'drizzle-orm';
import { db } from '#server/utils/db';
import { blobs } from '#server/utils/db/schema';

function blobPath(contentHash: string): string {
  const dataDir = resolve(process.cwd(), useRuntimeConfig().dataDir);
  return resolve(dataDir, 'blobs', contentHash.slice(0, 2), contentHash.slice(2));
}

/**
 * Store a blob file and its metadata. Returns the blob UUID.
 * Deduplicates: if the hash already exists, skips file write.
 */
export async function storeBlob(
  content: Buffer,
  mimeType: string,
): Promise<string> {
  const contentHash = Buffer.from(hash(content)).toString('hex');

  const existing = await db.select({ id: blobs.id }).from(blobs).where(eq(blobs.hash, contentHash)).limit(1);
  if (existing.length > 0) {
    return existing[0]!.id;
  }

  const id = crypto.randomUUID();
  const filePath = blobPath(contentHash);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  await db.insert(blobs).values({ id, hash: contentHash, mimeType, size: content.length });

  return id;
}

/**
 * Read a blob file from disk by its BLAKE3 hash.
 * @returns The file content, or null if not found.
 */
export async function readBlob(hash: string): Promise<Buffer | null> {
  try {
    return await readFile(blobPath(hash));
  } catch {
    return null;
  }
}
