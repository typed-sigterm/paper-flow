import type { DocumentPart } from '#shared/utils/models';

/** Recursively collect all text fields from DocumentPart tree. */
function collectTexts(
  parts: DocumentPart[],
  refs: { part: DocumentPart, field: 'headline' | 'details' }[],
): string[] {
  const texts: string[] = [];
  for (const p of parts) {
    if (p.headline.trim()) {
      texts.push(p.headline);
      refs.push({ part: p, field: 'headline' });
    }
    if (p.details.trim()) {
      texts.push(p.details);
      refs.push({ part: p, field: 'details' });
    }
    texts.push(...collectTexts(p.options, refs));
    texts.push(...collectTexts(p.children, refs));
  }
  return texts;
}

/**
 * Enhance all text fields in a DocumentPart tree via /api/enhance-text.
 * Mutates parts in place. Fails silently — keeps original text on error.
 */
export async function enhanceParts(parts: DocumentPart[]): Promise<void> {
  const refs: { part: DocumentPart, field: 'headline' | 'details' }[] = [];
  const texts = collectTexts(parts, refs);
  if (!texts.length)
    return;

  try {
    const { enhanced } = await $fetch<{ enhanced: string[] }>('/api/enhance-text', {
      method: 'POST',
      body: { texts },
    });
    for (let i = 0; i < refs.length; i++) {
      refs[i]!.part[refs[i]!.field] = enhanced[i]!;
    }
  } catch {
    // Keep original text on failure
  }
}
