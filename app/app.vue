<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale';
</script>

<template>
  <UApp :locale="zh_cn" :toaster="{ position: 'top-center' }">
    <NuxtLoadingIndicator />
    <NuxtPage />
  </UApp>
</template>
