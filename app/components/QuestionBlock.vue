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
    } catch (e) {
      figureErrors.value[key] = e instanceof Error ? e.message : '裁剪失败';
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
  } catch (e) {
    figureErrors.value[key] = (e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'data' in e ? (e.data as { message?: string })?.message : undefined) || '增强失败';
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
  <div class="rounded-lg bg-elevated p-4 border border-default">
    <!-- Headline -->
    <div class="mb-3">
      <pre class="whitespace-pre-wrap text-default font-medium m-0">{{ item.headline }}</pre>
    </div>

    <!-- Details -->
    <p v-if="item.details" class="text-sm text-muted mb-3">
      {{ item.details }}
    </p>

    <!-- Options -->
    <div v-if="item.options?.length" class="space-y-2 mb-3">
      <div
        v-for="(option, optIdx) in item.options"
        :key="optIdx"
        class="pl-4"
      >
        <QuestionBlock
          :item="option"
          :path="`${path}-opt-${optIdx}`"
          :document-id="documentId"
        />
      </div>
    </div>

    <!-- Children -->
    <div v-if="item.children?.length" class="space-y-2 mb-3">
      <QuestionBlock
        v-for="(child, childIdx) in item.children"
        :key="childIdx"
        :item="child"
        :path="`${path}-${childIdx}`"
        :document-id="documentId"
      />
    </div>

    <!-- Figures -->
    <div v-if="item.figures?.length" class="mt-3">
      <p class="text-sm font-medium text-muted mb-2">
        <UIcon name="i-lucide-image" class="size-3.5 inline-block mr-1" />
        插图（{{ item.figures.length }} 个）
      </p>
      <div class="flex flex-wrap gap-3">
        <div
          v-for="(fig, figIdx) in item.figures"
          :key="figIdx"
          class="relative group"
        >
          <div
            class="relative overflow-hidden rounded-lg border transition-all"
            :class="[
              enhancedFigures[`${path}-${figIdx}`]
                ? 'border-success'
                : 'border-default hover:border-accented',
              enhancingFigures[`${path}-${figIdx}`] ? 'opacity-50' : '',
            ]"
          >
            <img
              :src="figureSrc(figIdx)"
              :alt="`插图 ${figIdx + 1}`"
              class="max-w-75 max-h-50 object-contain cursor-pointer"
              :title="enhancedFigures[`${path}-${figIdx}`] ? '已增强（点击重新增强）' : '点击去水印+重绘增强'"
              @click="handleEnhanceFigure(figIdx)"
            >
            <!-- Loading overlay -->
            <div
              v-if="enhancingFigures[`${path}-${figIdx}`]"
              class="absolute inset-0 flex items-center justify-center bg-inverted/40"
            >
              <span class="text-xs text-inverted font-medium px-2 py-1 bg-inverted/60 rounded">
                增强中...
              </span>
            </div>
            <!-- Enhanced badge -->
            <UBadge
              v-if="enhancedFigures[`${path}-${figIdx}`]"
              color="success"
              label="已增强"

              class="absolute top-1 right-1"
            />
          </div>
          <!-- Error message -->
          <p
            v-if="figureErrors[`${path}-${figIdx}`]"
            class="text-xs text-error mt-1"
          >
            {{ figureErrors[`${path}-${figIdx}`] }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
