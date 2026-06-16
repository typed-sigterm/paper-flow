<script setup lang="ts">
const router = useRouter();
const documents = ref<{ id: string, title: string, status: string, createdAt: string }[]>([]);

async function fetchDocuments() {
  try {
    const data = await $fetch('/api/documents');
    documents.value = data.documents || [];
  } catch (e) {
    console.error('Failed to fetch documents:', e);
  }
}

async function handleDelete(id: string, event: MouseEvent) {
  event.stopPropagation();
  try {
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' });
    documents.value = documents.value.filter(d => d.id !== id);
    showSuccessToast('已删除');
  } catch (e) {
    showErrorToast('删除失败', { error: e });
  }
}

function statusColor(status: string) {
  if (status === 'done')
    return 'success';
  if (status === 'error')
    return 'error';
  return 'warning';
}

function statusLabel(status: string) {
  if (status === 'done')
    return '已完成';
  if (status === 'error')
    return '处理失败';
  return '处理中';
}

onMounted(fetchDocuments);
</script>

<template>
  <UContainer class="py-6 max-w-3xl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">
          PaperFlow
        </h1>
        <p class="text-sm text-muted mt-0.5">
          试卷扫描件转 Word，但是专业版
        </p>
      </div>
      <UButton
        label="上传新文档"
        icon="i-lucide-plus"
        to="/new"
      />
    </div>

    <!-- Document List -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-medium text-muted">
          文档列表
        </h2>
        <UButton
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="刷新"
          size="sm"
          color="neutral"
          @click="fetchDocuments"
        />
      </div>

      <UEmpty
        v-if="documents.length === 0"
        icon="i-lucide-file-text"
        title="暂无文档"
        description="上传你的第一个文档开始使用"
      />

      <div v-else class="flex flex-col gap-3">
        <UCard
          v-for="doc in documents"
          :key="doc.id"
          variant="subtle"
          class="cursor-pointer hover:border-accented transition-colors"
          @click="router.push(`/doc/${doc.id}`)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-highlighted truncate">{{ doc.title }}</span>
                <UBadge
                  :color="statusColor(doc.status)"
                  :label="statusLabel(doc.status)"
                  variant="subtle"
                />
              </div>
              <p class="text-sm text-muted">
                创建于 {{ new Date(doc.createdAt).toLocaleString() }}
              </p>
            </div>

            <UButton
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              @click="handleDelete(doc.id, $event)"
            />
          </div>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
