<script setup lang="ts">
import type { DocumentContent, DocumentStatus } from '#shared/utils/models';

const route = useRoute();
const router = useRouter();
const documentId = route.params.id as string;

interface DocumentItem {
  id: string
  title: string
  status: DocumentStatus
  error: string | null
  content: DocumentContent
  createdAt: string
}

const document = ref<DocumentItem | null>(null);
const loading = ref(true);
const error = ref('');
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchDocument() {
  try {
    const data = await $fetch<{ document: DocumentItem }>(`/api/documents/${documentId}`);
    document.value = data.document ?? null;

    if (document.value?.status === 'pending' || document.value?.status === 'processing') {
      if (!pollTimer) {
        pollTimer = setInterval(fetchDocument, 3000);
      }
    } else {
      stopPolling();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载文档失败';
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
  try {
    await $fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
    showSuccessToast('已删除');
    router.replace('/');
  } catch (e) {
    showErrorToast('删除失败', { error: e });
  }
}

async function handleExportDocx() {
  if (!document.value?.content?.parts?.length)
    return;
  try {
    const { exportDocx } = await import('~/utils/exporting');
    await exportDocx(document.value.content);
    showSuccessToast('导出成功');
  } catch (e) {
    showErrorToast('导出失败', { error: e });
  }
}

onMounted(fetchDocument);
onUnmounted(stopPolling);
</script>

<template>
  <PageLayout>
    <template #title>
      <template v-if="document">
        {{ document.title }}
        <UBadge
          v-if="document.status === 'done'"
          color="success"
          label="已完成"
          variant="subtle"
        />
        <UBadge
          v-else-if="document.status === 'error'"
          color="error"
          label="失败"
          variant="subtle"
        />
        <UBadge
          v-else
          color="warning"
          label="处理中"
          variant="subtle"
        />
      </template>
      <span v-else>文档详情</span>
    </template>

    <template v-if="document" #right>
      <UButton
        v-if="document.status === 'done'"
        label="导出 DOCX"
        icon="i-lucide-file-down"
        @click="handleExportDocx"
      />
      <UButton
        color="error"
        variant="outline"
        label="删除"
        icon="i-lucide-trash-2"
        @click="handleDelete"
      />
    </template>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-4">
      <USkeleton class="h-48 w-full rounded-lg" />
    </div>

    <!-- Error -->
    <UAlert
      v-else-if="error"
      color="error"
      icon="i-lucide-alert-triangle"
      title="加载失败"
      :description="error"
      variant="subtle"
    />

    <!-- Pending / Processing -->
    <UCard v-else-if="document?.status === 'pending' || document?.status === 'processing'">
      <div class="text-center py-10">
        <UIcon
          name="i-lucide-loader-2"
          class="size-12 text-primary animate-spin mx-auto mb-4"
        />
        <p class="text-lg font-medium text-highlighted mb-2">
          正在处理文档…
        </p>
        <p class="text-sm text-muted">
          识别 + 文本优化中，请稍候
        </p>
        <UProgress class="mt-6 max-w-xs mx-auto" />
      </div>
    </UCard>

    <!-- Error state -->
    <UCard v-else-if="document?.status === 'error'">
      <div class="text-center py-10">
        <UIcon
          name="i-lucide-alert-circle"
          class="size-12 text-error mx-auto mb-4"
        />
        <p class="text-lg font-medium text-error mb-2">
          处理失败
        </p>
        <p class="text-sm text-muted">
          {{ document.error }}
        </p>
      </div>
    </UCard>

    <!-- Done: show content -->
    <UCard v-else-if="document?.status === 'done'">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="size-5 text-primary" />
          <span class="font-semibold text-highlighted">文档内容</span>
        </div>
      </template>

      <template v-if="document.content?.parts?.length">
        <div class="space-y-4">
          <QuestionBlock
            v-for="(part, partIdx) in document.content.parts"
            :key="partIdx"
            :item="part"
            :path="`part-${partIdx}`"
            :document-id="documentId"
          />
        </div>
      </template>
      <UEmpty
        v-else
        icon="i-lucide-file-x"
        title="文档内容为空"
        description="未能从文档中提取到有效内容"
      />
    </UCard>
  </PageLayout>
</template>
