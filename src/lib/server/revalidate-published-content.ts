import { revalidatePath } from 'next/cache'

/**
 * Bust ISR caches for a newly published guide and the discovery surfaces
 * Google uses (sitemap + listing pages). Call after any publish/generate.
 */
export function revalidatePublishedContent(slug?: string | null): void {
  if (slug) {
    revalidatePath(`/guides/${slug}`)
  }
  revalidatePath('/guides')
  revalidatePath('/')
  revalidatePath('/sitemap.xml')
  revalidatePath('/sitemap-posts.xml')
}
