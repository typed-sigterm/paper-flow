import type { ImageRun, Paragraph, TextRun } from 'docx';
import type { DocumentContent, DocumentFigure, DocumentPart } from '#shared/utils/models';
import katex from 'katex';
import { createMarkdownExit } from 'markdown-exit';

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
    md.inline.ruler.after('escape', 'math_inline', (state, silent: boolean) => {
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
    md.block.ruler.before('fence', 'math_block', (state, startLine: number, endLine: number, silent: boolean) => {
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
    md.inline.ruler.after('math_inline', 'html_tags', (state, silent: boolean) => {
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

// ====== Figure image fetching ======

async function fetchFigureImage(
  fig: DocumentFigure,
  pageImageUrl?: string,
): Promise<{ bytes: Uint8Array, w: number, h: number } | null> {
  try {
    let blob: Blob;

    if (fig.redrawnBlob) {
      // Use enhanced/redrawn version from blob store
      const resp = await fetch(`/api/blobs/${fig.redrawnBlob}`);
      if (!resp.ok)
        return null;
      blob = await resp.blob();
    } else if (pageImageUrl && fig.originalRect.width > 0) {
      // Crop from original page image
      const resp = await fetch(pageImageUrl);
      if (!resp.ok)
        return null;
      const bmp = await createImageBitmap(await resp.blob());
      const { x, y, width, height } = fig.originalRect;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, x, y, width, height, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } else {
      return null;
    }

    const ab = await blob.arrayBuffer();
    let { width: w, height: h } = fig.originalRect;

    // Scale down to fit within printable area if needed
    const PAGE_CONTENT_WIDTH = 9360; // 12240 - 2*1440
    const MAX_SCALE = 4; // EMU per pixel for small images
    if (w > 0 && h > 0) {
      const emuW = w * MAX_SCALE;
      if (emuW > PAGE_CONTENT_WIDTH) {
        const ratio = PAGE_CONTENT_WIDTH / emuW;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      } else {
        w *= MAX_SCALE;
        h *= MAX_SCALE;
      }
    }

    return { bytes: new Uint8Array(ab), w, h };
  } catch {
    return null;
  }
}

// ====== Paragraph generation from DocumentPart ======

async function partToParagraphs(
  part: DocumentPart,
  depth: number,
  pageImageUrl?: string,
): Promise<Paragraph[]> {
  const { ImageRun, Paragraph } = await import('docx');
  const result: Paragraph[] = [];
  const indent = depth > 0 ? { left: depth * 480 } : undefined;

  // Headline
  if (part.headline.trim()) {
    result.push(...await textToParagraphs(part.headline, { indent }));
  }

  // Figures
  for (const fig of part.figures) {
    const img = await fetchFigureImage(fig, pageImageUrl);
    if (img) {
      result.push(new Paragraph({
        children: [new ImageRun({ data: img.bytes, transformation: { width: img.w, height: img.h }, type: 'png' })],
        spacing: { line: LINE_SPACING },
        indent,
      }));
    }
  }

  // Children (sub-questions)
  for (const child of part.children) {
    result.push(...await partToParagraphs(child, depth + 1, pageImageUrl));
  }

  // Options
  for (const opt of part.options) {
    if (opt.headline.trim()) {
      result.push(...await textToParagraphs(opt.headline, { singleParagraph: true }));
    }
  }

  return result;
}

// ====== Export to DOCX ======
export async function exportDocx(content: DocumentContent, pageImageUrl?: string) {
  const { AlignmentType, Document, Paragraph, Packer, TextRun } = await import('docx');
  if (!content.parts.length)
    return;

  const PAGE_WIDTH = 12240;
  const MARGIN = 1440;

  const children: Paragraph[] = [];
  children.push(new Paragraph({
    children: [new TextRun({
      text: '试卷切题 OCR 结果',
      font: { name: FONT_EN, eastAsia: FONT_CN },
      size: 40,
      bold: true,
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  for (const [i, part] of content.parts.entries()) {
    children.push(...await partToParagraphs(part, 0, pageImageUrl));
    if (i < content.parts.length - 1) {
      children.push(new Paragraph({ spacing: { before: 160, after: 160 } }));
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
