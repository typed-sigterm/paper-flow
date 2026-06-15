<template>
  <UContainer class="py-6 max-w-3xl">
    <div class="flex items-center justify-between gap-3 mb-6">
      <div class="flex items-center gap-2 min-w-0">
        <UButton
          variant="ghost"
          icon="i-lucide-arrow-left"
          color="neutral"
          to="/"
        />
        <h1 class="text-lg font-semibold text-highlighted truncate flex items-center gap-1.5">
          <slot name="title" />
        </h1>
      </div>
      <div v-if="$slots.right" class="flex items-center gap-1.5 shrink-0">
        <slot name="right" />
      </div>
    </div>

    <slot />
  </UContainer>
</template>
