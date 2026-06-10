<!-- eslint-disable no-alert temporary -->

<script setup lang="ts">
import { unpdf } from '~/utils/unpdf';

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const error = ref('');
const documents = ref<any[]>([]);

async function fetchDocuments() {
  try {
    const data = await $fetch('/api/documents');
    documents.value = data.documents || [];
  } catch (e: any) {
    console.error('Failed to fetch documents:', e);
  }
}

async function handleSubmit() {
  const file = fileInput.value?.files?.[0];
  if (!file)
    return;

  loading.value = true;
  error.value = '';

  try {
    const fd = new FormData();

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const { getDocumentProxy, renderPageAsImage } = await unpdf();
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      for (let i = 1; i <= pdf.numPages; i++) {
        const dataUrl = await renderPageAsImage(pdf, i, { toDataURL: true, scale: 2 }) as string;
        const blob = await (await fetch(dataUrl)).blob();
        fd.append('files', new File([blob], `page-${i}.png`, { type: 'image/png' }));
      }
    } else {
      fd.append('files', file);
    }

    const { documentId } = await $fetch<{ documentId: string }>('/api/documents', {
      method: 'POST',
      body: fd,
    });
    router.push(`/doc/${documentId}`);
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '上传失败';
  } finally {
    loading.value = false;
  }
}

async function handleDelete(id: string, event: MouseEvent) {
  event.stopPropagation();
  if (!confirm('确定删除此文档？'))
    return;
  try {
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' });
    documents.value = documents.value.filter(d => d.id !== id);
  } catch (e: any) {
    alert(e?.data?.message || '删除失败');
  }
}

onMounted(fetchDocuments);
</script>

<template>
  <div style="max-width: 960px; margin: 0 auto; padding: 24px; font-family: sans-serif;">
    <h1>PaperFlow</h1>
    <p>试卷扫描件转 Word，但是专业版。</p>

    <div style="margin: 24px 0; padding: 16px; border: 1px solid #ddd; border-radius: 4px;">
      <h2>上传新文档</h2>
      <form style="margin-top: 12px;" @submit.prevent="handleSubmit">
        <input
          ref="fileInput"
          type="file"
          accept="image/*,application/pdf"
          required
        >
        <button type="submit" :disabled="loading" style="margin-left: 8px;">
          {{ loading ? '上传中...' : '上传并处理' }}
        </button>
      </form>
      <p v-if="error" style="color: red; margin-top: 8px;">
        {{ error }}
      </p>
    </div>

    <div style="margin-top: 32px;">
      <h2>文档列表</h2>
      <div v-if="documents.length === 0" style="color: #666; margin-top: 12px;">
        暂无文档，请上传第一个文档。
      </div>
      <div v-else style="margin-top: 12px;">
        <div
          v-for="doc in documents"
          :key="doc.id"
          style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid #eee; border-radius: 4px; margin-bottom: 8px; cursor: pointer;"
          @click="router.push(`/doc/${doc.id}`)"
        >
          <div>
            <div style="font-weight: bold;">
              {{ doc.title }}
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              创建于 {{ new Date(doc.createdAt).toLocaleString() }}
              <span v-if="doc.status === 'pending' || doc.status === 'processing'" style="color: #d97706; margin-left: 8px;">处理中…</span>
              <span v-else-if="doc.status === 'error'" style="color: red; margin-left: 8px;">处理失败</span>
            </div>
          </div>
          <button
            style="padding: 4px 12px; color: #dc2626; background: none; border: 1px solid #fca5a5; border-radius: 4px; cursor: pointer;"
            @click="handleDelete(doc.id, $event)"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
