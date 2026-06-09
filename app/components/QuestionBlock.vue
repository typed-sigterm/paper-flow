<script setup lang="ts">
interface DocumentPart {
  headline: string
  details: string
  figures: {
    originalRect: { x: number, y: number, width: number, height: number }
    pendingRedraw: boolean
    redrawnBlob: string | null
  }[]
  options: DocumentPart[]
  children: DocumentPart[]
}

const props = defineProps<{
  item: DocumentPart
  path: string
  documentId?: string
  pageImage?: string
}>();

const croppedFigures = ref<Record<string, string>>({});
const enhancedFigures = ref<Record<string, string>>({});
const enhancingFigures = ref<Record<string, boolean>>({});
const figureErrors = ref<Record<string, string>>({});

/** Crop a figure region from the page image using canvas. */
async function cropFigure(dataUrl: string, rect: { x: number, y: number, width: number, height: number }): Promise<string> {
  const resp = await fetch(dataUrl);
  const bmp = await createImageBitmap(await resp.blob());
  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}

async function handleEnhanceFigure(figureIdx: number) {
  const key = `${props.path}-${figureIdx}`;
  if (enhancingFigures.value[key])
    return;

  const fig = props.item.figures[figureIdx];
  if (!fig)
    return;

  // Crop from page image if available and not already cropped
  if (props.pageImage && !croppedFigures.value[key]) {
    try {
      croppedFigures.value[key] = await cropFigure(props.pageImage, fig.originalRect);
    } catch (e: any) {
      figureErrors.value[key] = e?.message || '裁剪失败';
      return;
    }
  }

  const src = croppedFigures.value[key];
  if (!src) {
    figureErrors.value[key] = '无可用图片';
    return;
  }

  enhancingFigures.value[key] = true;
  figureErrors.value[key] = '';

  try {
    const blob = await (await fetch(src)).blob();
    const fd = new FormData();
    fd.append('file', blob, 'figure.png');
    const result = await $fetch<{ imageBase64: string }>('/api/enhance-image', {
      method: 'POST',
      body: fd,
    });
    enhancedFigures.value[key] = `data:image/png;base64,${result.imageBase64}`;
  } catch (e: any) {
    figureErrors.value[key] = e?.data?.message || e?.message || '增强失败';
  } finally {
    enhancingFigures.value[key] = false;
  }
}

function figureSrc(figureIdx: number) {
  const key = `${props.path}-${figureIdx}`;
  return enhancedFigures.value[key] || croppedFigures.value[key] || '';
}

// Auto-crop figures when pageImage is available
if (props.pageImage) {
  watch(() => props.item.figures, async (figs) => {
    for (let i = 0; i < figs.length; i++) {
      const fig = figs[i];
      if (!fig)
        continue;
      const key = `${props.path}-${i}`;
      if (!croppedFigures.value[key] && fig.originalRect.width > 0) {
        try {
          croppedFigures.value[key] = await cropFigure(props.pageImage!, fig.originalRect);
        } catch { /* ignore */ }
      }
    }
  }, { immediate: true });
}
</script>

<template>
  <div style="margin: 12px 0; padding: 12px; background: #f9f9f9; border-radius: 4px;">
    <!-- Headline -->
    <div style="margin-bottom: 8px;">
      <pre style="white-space: pre-wrap; margin: 4px 0;">{{ item.headline }}</pre>
    </div>

    <!-- Details -->
    <div v-if="item.details" style="margin: 8px 0; color: #666;">
      {{ item.details }}
    </div>

    <!-- Options -->
    <div v-if="item.options?.length" style="margin: 8px 0;">
      <div
        v-for="(option, optIdx) in item.options"
        :key="optIdx"
        style="margin: 4px 0 4px 16px;"
      >
        <QuestionBlock
          :item="option"
          :path="`${path}-opt-${optIdx}`"
          :document-id="documentId"
        />
      </div>
    </div>

    <!-- Children -->
    <div v-if="item.children?.length" style="margin: 8px 0;">
      <QuestionBlock
        v-for="(child, childIdx) in item.children"
        :key="childIdx"
        :item="child"
        :path="`${path}-${childIdx}`"
        :document-id="documentId"
      />
    </div>

    <!-- Figures -->
    <div v-if="item.figures?.length" style="margin: 8px 0;">
      <strong>插图（{{ item.figures.length }} 个）：</strong>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
        <div
          v-for="(fig, figIdx) in item.figures"
          :key="figIdx"
          style="position: relative; display: inline-block;"
        >
          <img
            :src="figureSrc(figIdx)"
            :alt="`插图 ${figIdx + 1}`"
            :style="{
              maxWidth: '300px',
              maxHeight: '200px',
              border: enhancedFigures[`${path}-${figIdx}`] ? '2px solid #10b981' : '1px solid #ccc',
              borderRadius: '2px',
              cursor: enhancingFigures[`${path}-${figIdx}`] ? 'wait' : 'pointer',
              opacity: enhancingFigures[`${path}-${figIdx}`] ? 0.5 : 1,
            }"
            :title="enhancedFigures[`${path}-${figIdx}`] ? '已增强（点击重新增强）' : '点击去水印+重绘增强'"
            @click="handleEnhanceFigure(figIdx)"
          >
          <span
            v-if="enhancingFigures[`${path}-${figIdx}`]"
            style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 12px; color: #333; background: rgba(255,255,255,0.8); padding: 2px 6px; border-radius: 4px;"
          >
            增强中...
          </span>
          <span
            v-if="enhancedFigures[`${path}-${figIdx}`]"
            style="position: absolute; top: 2px; right: 2px; font-size: 10px; color: #fff; background: #10b981; padding: 1px 4px; border-radius: 2px;"
          >
            ✓ 已增强
          </span>
          <p
            v-if="figureErrors[`${path}-${figIdx}`]"
            style="color: red; font-size: 12px; margin: 2px 0 0;"
          >
            {{ figureErrors[`${path}-${figIdx}`] }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
