/**
 * Repair content_html corrupted by re-hydrating already-rendered pipeline markup.
 * Removes nested product-review blocks and marked code-fence artifacts.
 */

export function repairCorruptedPipelineHtml(html: string): string {
  let out = html.trim()
  if (!/\bproduct-review\b/.test(out)) return out

  // marked turned nested HTML into <pre><code> blocks — drop them entirely
  out = out.replace(/<pre>\s*<code>[\s\S]*?<\/code>\s*<\/pre>/gi, '')
  out = out.replace(/<pre[\s\S]*?<\/pre>/gi, '')

  // Remove nested product-review cards leaked inside review-body (loop — multiple depths)
  for (let i = 0; i < 8; i++) {
    const next = out.replace(
      /(<div class="review-body">\s*)<div class="product-review">[\s\S]*?(?=\s*<\/div>\s*<div class="review-cta">)/gi,
      '$1',
    )
    if (next === out) break
    out = next
  }

  // Remove orphaned closing tags left after nested strips
  out = out.replace(/(<div class="review-body">\s*)<\/div>\s*<\/div>\s*/gi, '$1')

  return out
}

/** Keep only editorial <p> content from review-body — never nested pipeline chrome. */
export function extractEditorialReviewBody(reviewBodyInner: string): string {
  let inner = reviewBodyInner.trim()
  const cutAt = inner.search(/<div class="product-review">|<pre\b|<h2\b|<h3 class="product-name"/i)
  if (cutAt !== -1) inner = inner.slice(0, cutAt)
  inner = inner.replace(/<div class="bottom-line">[\s\S]*$/i, '').trim()
  return inner
}
