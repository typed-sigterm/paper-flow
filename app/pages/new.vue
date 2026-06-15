<script setup lang="ts">
import { unpdf } from '~/utils/unpdf';

const router = useRouter();
const loading = ref(false);

async function handleUpload(file: File) {
  loading.value = true;

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
  } catch (e) {
    showErrorToast('上传失败', { error: e });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <PageLayout>
    <template #title>
      上传新文档
    </template>

    <UCard>
      <UFileUpload
        accept="image/*,application/pdf"
        :loading="loading"
        label="拖放文件到此处，或点击上传"
        description="支持 PDF 和图片格式"
        icon="i-lucide-file-up"
        @update:model-value="(f: File | null | undefined) => f && handleUpload(f)"
      />
    </UCard>
  </PageLayout>
</template>
