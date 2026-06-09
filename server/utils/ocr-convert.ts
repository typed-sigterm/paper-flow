import type { DocumentPart } from '#shared/utils/models';

/** Tencent OCR result item (internal to this module). */
interface OcrItem {
  Question?: { Text?: string, ResultList?: OcrItem[], Index?: number }[]
  Option?: { Text?: string }[]
  Answer?: { Text?: string }[]
  Figure?: { Coord?: { LeftTop: { X: number, Y: number }, RightBottom: { X: number, Y: number } } }[]
}

/** Convert a single Tencent OCR item to DocumentPart. */
function convertItem(item: OcrItem): DocumentPart {
  const headline = item.Question?.[0]?.Text || '';
  const answers = (item.Answer ?? []).map(a => a.Text || '').filter(Boolean);
  const details = answers.length > 0 ? `答案：${answers.join(' ')}` : '';
  const options: DocumentPart[] = (item.Option ?? []).map(opt => ({
    headline: opt.Text || '',
    details: '',
    figures: [],
    options: [],
    children: [],
  }));
  const figures = (item.Figure ?? [])
    .filter(f => f.Coord)
    .map(f => ({
      originalRect: {
        x: f.Coord!.LeftTop.X,
        y: f.Coord!.LeftTop.Y,
        width: f.Coord!.RightBottom.X - f.Coord!.LeftTop.X,
        height: f.Coord!.RightBottom.Y - f.Coord!.LeftTop.Y,
      },
      pendingRedraw: false,
      redrawnBlob: null as string | null,
    }));
  const children: DocumentPart[] = (item.Question?.[0]?.ResultList ?? []).map(convertItem);
  return { headline, details, figures, options, children };
}

/** Convert Tencent OCR response to DocumentPart[]. */
export function ocrResultToParts(ocrResult: Record<string, any>): DocumentPart[] {
  const parts: DocumentPart[] = [];
  for (const qInfo of ocrResult.QuestionInfo ?? []) {
    for (const item of qInfo.ResultList ?? []) {
      parts.push(convertItem(item));
    }
  }
  return parts;
}
