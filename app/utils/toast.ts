import type { Toast } from '@nuxt/ui';

export function showSuccessToast(title: string, options?: Partial<Omit<Toast, 'title'>>) {
  const toast = useToast();
  toast.add({
    title,
    color: 'success',
    icon: 'i-lucide-check-circle',
    ...options,
  });
}

export function showErrorToast(title: string, options?: Partial<Omit<Toast, 'title'>> & { error?: unknown }) {
  const toast = useToast();
  const { error, ...rest } = options ?? {};
  const description
    = rest.description
      ?? (error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'data' in error ? (error.data as { message?: string })?.message : undefined)
      ?? '请重试';
  toast.add({
    title,
    description,
    color: 'error',
    icon: 'i-lucide-alert-circle',
    ...rest,
  });
}
