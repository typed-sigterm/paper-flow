/* eslint-disable ts/no-redeclare */
import * as z from 'zod';

export const BlobId = z.uuid();

export const Rect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const DocumentFigure = z.object({
  originalRect: Rect,
  pendingRedraw: z.boolean(),
  redrawnBlob: BlobId.nullable(),
});

export const DocumentPart = z.object({
  headline: z.string(),
  details: z.string(),
  figures: DocumentFigure.array(),
  get options() {
    return DocumentPart.array();
  },
  get children() {
    return DocumentPart.array();
  },
});
export type DocumentPart = z.infer<typeof DocumentPart>;

export const DocumentContent = z.object({
  schema: z.literal(1),
  parts: DocumentPart.array(),
});
export type DocumentContent = z.infer<typeof DocumentContent>;

export const DocumentStatus = z.enum(['pending', 'processing', 'done', 'error']);
export type DocumentStatus = z.infer<typeof DocumentStatus>;
