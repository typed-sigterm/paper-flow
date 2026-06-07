import type { ImageRun, Paragraph, TextRun } from 'docx';
import katex from 'katex';
import { createMarkdownExit } from 'markdown-exit';

interface Coord {
  LeftTop: { X: number, Y: number }
  RightBottom: { X: number, Y: number }
}

interface OcrItem {
  Question?: { Text?: string, ResultList?: OcrItem[], Index?: number }[]
  Option?: { Text?: string }[]
  Answer?: { Text?: string }[]
  Figure?: { Coord?: Coord }[]
}

interface PageResult {
  imageDataUrl: string
  result: {
    QuestionInfo?: { Width?: number, Height?: number, ResultList?: OcrItem[] }[]
  }
}

// ====== Constants ======
const FONT_SIZE_PT = 10.5;
const FONT_SIZE_HP = 21;
const FONT_CN = 'SimSun';
const FONT_EN = 'Times New Roman';
const LINE_SPACING = 360;
const TEXT_OPTS = { font: { name: FONT_EN, eastAsia: FONT_CN }, size: FONT_SIZE_HP } as const;

// 智能分割文本：区分中英文，应用不同字体
async function splitTextByLang(text: string, bold: boolean, italic: boolean): Promise<TextRun[]> {
  const { TextRun } = await import('docx');
  const runs: TextRun[] = [];
  if (!text)
    return runs;

  let chunk = '';
  let chunkIsZh = /[\u4E00-\u9FFF]/.test(text[0]!);

  for (const ch of text) {
    const isZh = /[\u4E00-\u9FFF]/.test(ch);
    if (isZh !== chunkIsZh) {
      // 类型变化，输出当前块
      if (chunk) {
        const font = chunkIsZh ? { name: FONT_EN, eastAsia: FONT_CN } : { name: FONT_EN };
        runs.push(new TextRun({ text: chunk, font, size: FONT_SIZE_HP, bold, italics: italic }));
      }
      chunk = ch;
      chunkIsZh = isZh;
    } else {
      chunk += ch;
    }
  }

  // 输出最后一块
  if (chunk) {
    const font = chunkIsZh ? { name: FONT_EN, eastAsia: FONT_CN } : { name: FONT_EN };
    runs.push(new TextRun({ text: chunk, font, size: FONT_SIZE_HP, bold, italics: italic }));
  }

  return runs;
}

// ====== Utilities ======
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]!;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function cropFigure(imageDataUrl: string, coord: Coord): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { X: x, Y: y } = coord.LeftTop;
      const w = coord.RightBottom.X - x;
      const h = coord.RightBottom.Y - y;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
  });
}

async function collectFigures(
  item: OcrItem,
  imageDataUrl: string,
  path: string,
  figures: Map<string, string>,
): Promise<void> {
  for (const [i, fig] of (item.Figure ?? []).entries()) {
    if (fig.Coord && !figures.has(`${path}-${i}`)) {
      figures.set(`${path}-${i}`, await cropFigure(imageDataUrl, fig.Coord));
    }
  }
  for (const ques of item.Question ?? []) {
    for (const [i, child] of (ques.ResultList ?? []).entries()) {
      await collectFigures(child, imageDataUrl, `${path}-q${i}`, figures);
    }
  }
}

// ====== KaTeX → PNG ======
async function katexToPng(tex: string, displayMode: boolean): Promise<{ bytes: Uint8Array, w: number, h: number }> {
  const html = katex.renderToString(tex, { displayMode, throwOnError: false });
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:-99999px;font-size:${FONT_SIZE_PT}pt;line-height:1.5`;
  el.innerHTML = html;
  document.body.appendChild(el);
  const { offsetWidth: w, offsetHeight: h } = el;
  document.body.removeChild(el);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 4}" height="${h + 4}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${FONT_SIZE_PT}pt;line-height:1.5">${html}</div></foreignObject></svg>`;
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = (w + 4) * dpr;
      canvas.height = (h + 4) * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, w + 4, h + 4);
      canvas.toBlob((b) => {
        if (!b)
          reject(new Error('Canvas blob failed'));
        else b.arrayBuffer().then(ab => resolve({ bytes: new Uint8Array(ab), w: w + 4, h: h + 4 }));
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('SVG render failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// ====== Markdown Parser Setup ======
// 字符码常量
const CC = { DOLLAR: 0x24, LT: 0x3C, GT: 0x3E, BACKSLASH: 0x5C };

const md = createMarkdownExit({
  html: true,
  linkify: false,
  typographer: false,
})
  .use((md) => {
    // 内联数学：$...$
    md.inline.ruler.after('escape', 'math_inline', (state: any, silent: boolean) => {
      if (state.src.charCodeAt(state.pos) !== CC.DOLLAR)
        return false;
      const start = state.pos + 1;
      let end = start;
      let escaped = false;
      while (end < state.posMax) {
        if (escaped) {
          escaped = false;
          end++;
          continue;
        }
        if (state.src.charCodeAt(end) === CC.BACKSLASH) {
          escaped = true;
          end++;
          continue;
        }
        if (state.src.charCodeAt(end) === CC.DOLLAR)
          break;
        end++;
      }
      if (end >= state.posMax || end === start)
        return false;
      if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.content = state.src.slice(start, end);
      }
      state.pos = end + 1;
      return true;
    });

    // 块级数学：$$...$$
    md.block.ruler.before('fence', 'math_block', (state: any, startLine: number, endLine: number, silent: boolean) => {
      const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
      if (pos + 1 >= state.eMarks[startLine]!)
        return false;
      if (state.src.charCodeAt(pos) !== CC.DOLLAR || state.src.charCodeAt(pos + 1) !== CC.DOLLAR)
        return false;

      let nextLine = startLine + 1;
      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!;
        const lineEnd = state.eMarks[nextLine]!;
        if (lineStart + 1 < lineEnd && state.src.charCodeAt(lineStart) === CC.DOLLAR && state.src.charCodeAt(lineStart + 1) === CC.DOLLAR) {
          if (!silent) {
            const content = state.getLines(startLine + 1, nextLine, 0, true).trim();
            const token = state.push('math_block', 'math', 0);
            token.content = content;
            token.map = [startLine, nextLine + 1];
          }
          state.line = nextLine + 1;
          return true;
        }
        nextLine++;
      }
      return false;
    });

    // HTML 标签：<u>、<sub>、<sup>、<code>
    md.inline.ruler.disable('html_inline');
    md.inline.ruler.after('math_inline', 'html_tags', (state: any, silent: boolean) => {
      if (state.src.charCodeAt(state.pos) !== CC.LT)
        return false;

      const src = state.src;
      const pos = state.pos;
      const tagEnd = src.indexOf('>', pos);
      if (tagEnd < 0)
        return false;

      const tagMatch = src.slice(pos + 1, tagEnd).match(/^(\w+)/);
      if (!tagMatch)
        return false;
      const tag = tagMatch[1]!.toLowerCase();
      if (!['u', 'sub', 'sup', 'code'].includes(tag))
        return false;

      const closeTag = `</${tag}>`;
      const closeIdx = src.indexOf(closeTag, tagEnd);
      if (closeIdx < 0)
        return false;

      if (!silent) {
        const token = state.push(`tag_${tag}`, '', 0);
        token.content = src.slice(tagEnd + 1, closeIdx);
      }
      state.pos = closeIdx + closeTag.length;
      return true;
    });
  });

async function textToParagraphs(
  text: string,
  opts?: { indent?: object, prefix?: (TextRun | ImageRun)[], bold?: boolean, singleParagraph?: boolean },
): Promise<Paragraph[]> {
  const { AlignmentType, ImageRun, Paragraph, TextRun } = await import('docx');
  if (!text?.trim())
    return [];

  const tokens = md.parse(text.trim(), {});
  const result: Paragraph[] = [];
  let runs: (TextRun | ImageRun)[] = [...(opts?.prefix ?? [])];
  let bold = opts?.bold ?? false;
  let italic = false;
  const singleMode = opts?.singleParagraph ?? false;

  const flush = () => {
    if (runs.length) {
      result.push(new Paragraph({
        children: runs,
        spacing: { line: LINE_SPACING },
        indent: opts?.indent,
      }));
      runs = [];
    }
  };

  for (const token of tokens) {
    if (token.type === 'paragraph_open') {
      if (!singleMode)
        flush();
      continue;
    }

    if (token.type === 'math_block') {
      if (!singleMode)
        flush();
      try {
        const { bytes, w, h } = await katexToPng(token.content, true);
        result.push(new Paragraph({
          children: [new ImageRun({ data: bytes, transformation: { width: w, height: h }, type: 'png' })],
          alignment: AlignmentType.CENTER,
          spacing: { line: LINE_SPACING },
          indent: opts?.indent,
        }));
      } catch {
        runs.push(new TextRun({ text: `$$${token.content}$$`, ...TEXT_OPTS }));
        if (!singleMode)
          flush();
      }
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      if (!singleMode)
        flush();
      const codeFont = { name: 'Consolas', eastAsia: FONT_CN };
      const lines = token.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (i === lines.length - 1 && !line.trim())
          continue;
        if (!singleMode) {
          result.push(new Paragraph({
            children: [new TextRun({ text: line, font: codeFont, size: FONT_SIZE_HP })],
            spacing: { line: LINE_SPACING },
            indent: opts?.indent,
          }));
        } else {
          runs.push(new TextRun({ text: `${line}\n`, font: codeFont, size: FONT_SIZE_HP }));
        }
      }
      continue;
    }

    if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'text') {
          runs.push(...await splitTextByLang(child.content, bold, italic));
        } else if (child.type === 'code_inline') {
          runs.push(new TextRun({ text: child.content, font: { name: 'Consolas', eastAsia: 'Consolas' }, size: FONT_SIZE_HP }));
        } else if (child.type === 'softbreak') {
          if (!singleMode) {
            flush();
            if (opts?.prefix)
              runs.push(...opts.prefix);
          } else {
            runs.push(new TextRun({ text: '\n', ...TEXT_OPTS }));
          }
        } else if (child.type === 'strong_open') {
          bold = true;
        } else if (child.type === 'strong_close') {
          bold = false;
        } else if (child.type === 'em_open') {
          italic = true;
        } else if (child.type === 'em_close') {
          italic = false;
        } else if (child.type === 'math_inline') {
          try {
            const { bytes, w, h } = await katexToPng(child.content, false);
            runs.push(new ImageRun({ data: bytes, transformation: { width: w, height: h }, type: 'png' }));
          } catch {
            runs.push(new TextRun({ text: `$${child.content}$`, bold, italics: italic, ...TEXT_OPTS }));
          }
        } else if (child.type?.startsWith('tag_')) {
          const tagName = child.type.slice(4);
          const content = child.content;
          if (tagName === 'u') {
            runs.push(new TextRun({ text: content, underline: {}, bold, italics: italic, ...TEXT_OPTS }));
          } else if (tagName === 'sub') {
            runs.push(new TextRun({ text: content, subScript: true, bold, italics: italic, ...TEXT_OPTS }));
          } else if (tagName === 'sup') {
            runs.push(new TextRun({ text: content, superScript: true, bold, italics: italic, ...TEXT_OPTS }));
          } else if (tagName === 'code') {
            runs.push(new TextRun({ text: content, font: { name: 'Consolas', eastAsia: 'Consolas' }, size: FONT_SIZE_HP }));
          }
        }
      }
    }
  }

  flush();
  return result;
}

// ====== Paragraph generation from OCR items ======
async function itemToParagraphs(
  item: OcrItem,
  path: string,
  figures: Map<string, string>,
  imgW: number,
  usableW: number,
  depth: number,
): Promise<Paragraph[]> {
  const { AlignmentType, ImageRun, Paragraph } = await import('docx');
  const result: Paragraph[] = [];
  const indent = depth > 0 ? { left: depth * 480 } : undefined;

  for (const [qIdx, ques] of (item.Question ?? []).entries()) {
    // 题目编号：1. 2. 3.
    const qNum = `${qIdx + 1}. `;
    result.push(...await textToParagraphs(qNum + (ques.Text ?? ''), { indent }));

    for (const [i, child] of (ques.ResultList ?? []).entries()) {
      result.push(...await itemToParagraphs(child, `${path}-q${i}`, figures, imgW, usableW, depth + 1));
    }
  }

  for (const opt of (item.Option ?? [])) {
    if (opt.Text) {
      const paragraphs = await textToParagraphs(opt.Text, {
        singleParagraph: true,
      });
      result.push(...paragraphs);
    }
  }

  for (const [i, fig] of (item.Figure ?? []).entries()) {
    if (!fig.Coord)
      continue;
    const key = `${path}-${i}`;
    const dataUrl = figures.get(key);
    if (!dataUrl)
      continue;

    const figW = fig.Coord.RightBottom.X - fig.Coord.LeftTop.X;
    const figH = fig.Coord.RightBottom.Y - fig.Coord.LeftTop.Y;
    let w = Math.round(usableW * (figW / imgW));
    if (w > usableW)
      w = usableW;
    const h = Math.round(w * (figH / figW));

    result.push(new Paragraph({
      children: [new ImageRun({ data: dataUrlToUint8Array(dataUrl), transformation: { width: w, height: h }, type: 'png' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      indent,
    }));
  }

  return result;
}

// ====== Export to DOCX ======
export async function exportDocx(pages: PageResult[]) {
  const { AlignmentType, Document, Paragraph, Packer, TextRun } = await import('docx');
  if (!pages.length)
    return;

  const PAGE_WIDTH = 12240;
  const MARGIN = 1440;
  const USABLE_W = Math.round((PAGE_WIDTH - MARGIN * 2) * 96 / 1440);

  const children: Paragraph[] = [];
  children.push(new Paragraph({
    children: [new TextRun({
      text: '试卷切题 OCR 结果',
      font: { name: FONT_EN, eastAsia: FONT_CN },
      size: 40, // 20pt in half-points
      bold: true,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  for (const [pi, page] of pages.entries()) {
    const imgW = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth);
      img.src = page.imageDataUrl;
    });

    for (const [qi, qInfo] of (page.result?.QuestionInfo ?? []).entries()) {
      const basePath = `p${pi}-${qi}`;
      const figures = new Map<string, string>();

      for (const [ii, item] of (qInfo.ResultList ?? []).entries()) {
        await collectFigures(item, page.imageDataUrl, `${basePath}-${ii}`, figures);
      }

      for (const [ii, item] of (qInfo.ResultList ?? []).entries()) {
        children.push(...await itemToParagraphs(item, `${basePath}-${ii}`, figures, imgW, USABLE_W, 0));
        children.push(new Paragraph({ spacing: { before: 160, after: 160 } }));
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: PAGE_WIDTH }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '试卷切题结果.docx';
  a.click();
  URL.revokeObjectURL(url);
}
