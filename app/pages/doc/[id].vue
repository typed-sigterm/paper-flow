<!-- eslint-disable no-alert temporary -->

<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const documentId = route.params.id as string;

const document = ref<any>(null);
const loading = ref(true);
const error = ref('');
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchDocument() {
  try {
    const data = await $fetch(`/api/documents/${documentId}`);
    document.value = data.document;

    if (document.value?.status === 'pending' || document.value?.status === 'processing') {
      if (!pollTimer) {
        pollTimer = setInterval(fetchDocument, 3000);
      }
    } else {
      stopPolling();
    }
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '加载文档失败';
    stopPolling();
  } finally {
    loading.value = false;
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handleDelete() {
  if (!confirm('确定删除此文档？'))
    return;
  try {
    await $fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
    router.push('/');
  } catch (e: any) {
    alert(e?.data?.message || '删除失败');
  }
}

async function handleExportDocx() {
  if (!document.value?.content?.parts?.length)
    return;
  try {
    const { exportDocx } = await import('~/utils/exporting');
    await exportDocx(document.value.content);
  } catch (e) {
    console.error('Export failed:', e);
  }
}

onMounted(fetchDocument);
onUnmounted(stopPolling);
</script>

<template>
  <div style="max-width: 960px; margin: 0 auto; padding: 24px; font-family: sans-serif;">
    <div v-if="loading" style="text-align: center; color: #666;">
      加载中...
    </div>

    <div v-else-if="error" style="color: red; text-align: center;">
      {{ error }}
    </div>

    <div v-else-if="document">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
        <h1>{{ document.title }}</h1>
        <div style="display: flex; gap: 8px;">
          <button
            v-if="document.status === 'done'"
            style="padding: 8px 16px;"
            @click="handleExportDocx"
          >
            导出 DOCX
          </button>
          <button
            style="padding: 8px 16px; color: #dc2626; border: 1px solid #fca5a5; border-radius: 4px; background: none;"
            @click="handleDelete"
          >
            删除
          </button>
        </div>
      </div>

      <!-- Pending / Processing -->
      <div
        v-if="document.status === 'pending' || document.status === 'processing'"
        style="text-align: center; padding: 48px; color: #666;"
      >
        <p style="font-size: 18px;">
          正在处理文档…
        </p>
        <p style="font-size: 14px; margin-top: 8px;">
          识别 + 文本优化中，请稍候
        </p>
      </div>

      <!-- Error -->
      <div v-else-if="document.status === 'error'" style="text-align: center; padding: 48px; color: red;">
        <p style="font-size: 18px;">
          处理失败
        </p>
        <p style="font-size: 14px; margin-top: 8px;">
          {{ document.error }}
        </p>
      </div>

      <!-- Done: show content -->
      <div v-else-if="document.status === 'done'" style="border: 1px solid #ddd; border-radius: 4px; padding: 16px;">
        <template v-if="document.content?.parts?.length">
          <QuestionBlock
            v-for="(part, partIdx) in document.content.parts"
            :key="partIdx"
            :item="part"
            :path="`part-${partIdx}`"
            :document-id="documentId"
          />
        </template>
        <div v-else style="color: #666; text-align: center;">
          文档内容为空
        </div>
      </div>
    </div>
  </div>
</template>
