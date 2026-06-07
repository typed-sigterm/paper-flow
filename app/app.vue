<script setup lang="ts">
import { ref } from 'vue';
import { cropFigure, exportDocx } from '~/utils/exporting';
import { unpdf } from '~/utils/unpdf';

interface PageResult {
  imageDataUrl: string
  result: any // OCR API response
}

const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const error = ref('');
const progress = ref('');
const pages = ref<PageResult[]>([]);
const croppedFigures = ref<Record<string, string>>({});
// key path like "p0-0-1" = page 0, result 0, figure 1

async function handleSubmit() {
  const file = fileInput.value?.files?.[0];
  if (!file)
    return;

  loading.value = true;
  error.value = '';
  progress.value = '';
  pages.value = [];

  try {
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    if (isPdf)
      await processPdf(file);
    else
      await processImage(file);
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '请求失败';
  } finally {
    loading.value = false;
    progress.value = '';
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToFormData(file: File): FormData {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
}

async function processImage(file: File) {
  progress.value = '正在识别图片...';
  const dataUrl = await readAsDataUrl(file);
  const result = await $fetch('/api/ocr', {
    method: 'POST',
    body: fileToFormData(file),
  });
  const page = { imageDataUrl: dataUrl, result };
  await enhancePageTexts(page);
  pages.value = [page];
}

async function processPdf(file: File) {
  const { getDocumentProxy, renderPageAsImage } = await unpdf();
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  const pdf = await getDocumentProxy(uint8);
  const pageCount = pdf.numPages;

  progress.value = `正在渲染 PDF 页面（共 ${pageCount} 页）...`;

  for (let i = 0; i < pageCount; i++) {
    const pageNum = i + 1;
    progress.value = `正在处理第 ${pageNum} / ${pageCount} 页...`;

    const imageDataUrl = await renderPageAsImage(pdf, pageNum, {
      toDataURL: true,
      scale: 2,
    }) as string;

    // Send the rendered page image to OCR (not the PDF bytes) so
    // coordinates match the rendered image exactly.
    const imageBlob = await (await fetch(imageDataUrl)).blob();
    const imageFile = new File([imageBlob], `page-${pageNum}.png`, { type: 'image/png' });
    const result = await $fetch('/api/ocr', {
      method: 'POST',
      body: fileToFormData(imageFile),
    });

    const page = { imageDataUrl, result };
    await enhancePageTexts(page);
    pages.value = [...pages.value, page];
  }
}

/** Collect all text fields from OCR result, send to LLM for enhancement. */
async function enhancePageTexts(page: PageResult) {
  const qiList = page.result?.QuestionInfo ?? [];
  const texts: string[] = [];
  const refs: { qi: number, ri: number, type: 'q' | 'o', qIdx?: number, oIdx?: number }[] = [];

  for (const [qi, qInfo] of qiList.entries()) {
    for (const [ri, item] of (qInfo.ResultList ?? []).entries()) {
      if (item.Question) {
        for (const [qIdx, q] of item.Question.entries()) {
          if (q.Text?.trim()) {
            texts.push(q.Text);
            refs.push({ qi, ri, type: 'q', qIdx });
          }
        }
      }
      if (item.Option) {
        for (const [oIdx, opt] of item.Option.entries()) {
          if (opt.Text?.trim()) {
            texts.push(opt.Text);
            refs.push({ qi, ri, type: 'o', oIdx });
          }
        }
      }
    }
  }

  if (!texts.length)
    return;

  try {
    progress.value = `${progress.value}（正在优化文本…）`;
    const { enhanced } = await $fetch<{ enhanced: string[] }>('/api/enhance-text', {
      method: 'POST',
      body: { texts },
    });

    // Write enhanced texts back
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]!;
      const item = qiList[ref.qi]?.ResultList?.[ref.ri];
      if (!item)
        continue;
      if (ref.type === 'q' && ref.qIdx != null) {
        const q = item.Question?.[ref.qIdx];
        if (q)
          q.Text = enhanced[i];
      } else if (ref.type === 'o' && ref.oIdx != null) {
        const opt = item.Option?.[ref.oIdx];
        if (opt)
          opt.Text = enhanced[i];
      }
    }
  } catch {
    // Enhancement failed silently — keep original OCR text
  }
}

async function collectFigures(
  item: any,
  imageDataUrl: string,
  path: string,
): Promise<void> {
  for (const [figIdx, fig] of (item.Figure ?? []).entries()) {
    if (fig.Coord) {
      croppedFigures.value[`${path}-${figIdx}`]
        = await cropFigure(imageDataUrl, fig.Coord);
    }
  }
  for (const ques of item.Question ?? []) {
    if (ques.ResultList?.length) {
      for (const [childIdx, child] of ques.ResultList.entries()) {
        await collectFigures(child, imageDataUrl, `${path}-${childIdx}`);
      }
    }
  }
}

watch(pages, async (val) => {
  croppedFigures.value = {};
  for (const [pageIdx, page] of val.entries()) {
    const qiList = page.result?.QuestionInfo ?? [];
    for (const [qiIdx, qi] of qiList.entries()) {
      for (const [qIdx, item] of (qi.ResultList ?? []).entries()) {
        await collectFigures(
          item,
          page.imageDataUrl,
          `p${pageIdx}-${qiIdx}-${qIdx}`,
        );
      }
    }
  }
}, { immediate: true });

async function handleExportDocx() {
  await exportDocx(pages.value);
}
</script>

<template>
  <div style="max-width: 960px; margin: 0 auto; padding: 24px; font-family: sans-serif;">
    <h1>PaperFlow</h1>
    <p>
      试卷扫描件转 Word，但是专业版。
    </p>

    <form style="margin: 16px 0;" @submit.prevent="handleSubmit">
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/bmp,application/pdf"
        required
      >
      <button type="submit" :disabled="loading" style="margin-left: 8px;">
        {{ loading ? '识别中...' : '开始识别' }}
      </button>
    </form>

    <p v-if="progress" style="color: #666;">
      {{ progress }}
    </p>

    <div v-if="error" style="color: red; margin: 16px 0;">
      错误：{{ error }}
    </div>

    <div v-if="pages.length" style="margin-top: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <h2>识别结果（共 {{ pages.length }} 页）</h2>
        <button @click="handleExportDocx">
          导出 DOCX
        </button>
      </div>

      <div
        v-for="(page, pageIdx) in pages"
        :key="pageIdx"
        style="border: 1px solid #ddd; border-radius: 4px; padding: 16px; margin-bottom: 16px;"
      >
        <h3>第 {{ pageIdx + 1 }} 页</h3>
        <div
          v-for="(qi, qiIdx) in page.result?.QuestionInfo"
          :key="qiIdx"
          style="margin-bottom: 16px;"
        >
          <h4>题目区域 {{ qiIdx + 1 }}（{{ qi.Width }}×{{ qi.Height }}）</h4>
          <QuestionBlock
            v-for="(q, qIdx) in qi.ResultList"
            :key="qIdx"
            :item="q"
            :figure-map="croppedFigures"
            :page-image="page.imageDataUrl"
            :path="`p${pageIdx}-${qiIdx}-${qIdx}`"
          />
        </div>
      </div>
    </div>
  </div>
</template>
