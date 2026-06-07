<script setup lang="ts">
const props = defineProps<{
  item: any
  figureMap: Record<string, string>
  pageImage: string // page-level image data URL for figure cropping
  path: string // unique key prefix, e.g. "p0-0-2"
}>();

const enhancedFigures = ref<Record<string, string>>({});
const enhancingFigures = ref<Record<string, boolean>>({});
const figureErrors = ref<Record<string, string>>({});

async function handleEnhanceFigure(figIdx: number) {
  const key = `${props.path}-${figIdx}`;
  const src = props.figureMap[key];
  if (!src || enhancingFigures.value[key])
    return;

  enhancingFigures.value[key] = true;
  figureErrors.value[key] = '';

  try {
    const blob = await (await fetch(src)).blob();
    const file = new File([blob], 'figure.png', { type: 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
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

function figureSrc(figIdx: number) {
  const key = `${props.path}-${figIdx}`;
  return enhancedFigures.value[key] || props.figureMap[key];
}
</script>

<template>
  <div style="margin: 12px 0; padding: 12px; background: #f9f9f9; border-radius: 4px;">
    <!-- Question text (may contain nested ResultList children) -->
    <template v-if="item.Question?.length">
      <div v-for="(ques, quesIdx) in item.Question" :key="quesIdx" style="margin-bottom: 8px;">
        <pre style="white-space: pre-wrap; margin: 4px 0;">{{ ques.Text }}</pre>

        <!-- Nested child ResultList inside this Question -->
        <template v-if="ques.ResultList?.length">
          <QuestionBlock
            v-for="(child, childIdx) in ques.ResultList"
            :key="childIdx"
            :item="child"
            :figure-map="figureMap"
            :page-image="pageImage"
            :path="`${path}-${childIdx}`"
          />
        </template>
      </div>
    </template>

    <!-- Options -->
    <template v-if="item.Option?.length">
      <div style="margin: 8px 0;">
        <div
          v-for="(opt, optIdx) in item.Option"
          :key="optIdx"
          style="margin: 4px 0 4px 16px;"
        >
          {{ opt.Text }}
        </div>
      </div>
    </template>

    <!-- Answer -->
    <template v-if="item.Answer?.length">
      <div style="margin: 8px 0;">
        <strong>答案：</strong>
        <span v-for="(ans, ansIdx) in item.Answer" :key="ansIdx">
          {{ ans.Text }}{{ ansIdx < item.Answer.length - 1 ? ' ' : '' }}
        </span>
      </div>
    </template>

    <!-- Figures (cropped from original image) -->
    <template v-if="item.Figure?.length">
      <div style="margin: 8px 0;">
        <strong>插图（{{ item.Figure.length }} 个）：</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
          <div
            v-for="(fig, figIdx) in item.Figure"
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
    </template>
  </div>
</template>
