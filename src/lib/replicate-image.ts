import Replicate from 'replicate'

function getReplicateAuth(): string | undefined {
  const token = (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()
  return token || undefined
}

const replicate = new Replicate({
  auth: getReplicateAuth(),
})

async function resolveImageUrl(output: unknown): Promise<string | null> {
  const first = Array.isArray(output) ? output[0] : output
  if (!first) return null
  if (typeof first === 'string') return first
  if (typeof first === 'object' && first !== null) {
    const value = first as { url?: () => string; href?: string }
    if (typeof value.url === 'function') return value.url()
    if (value.href) return value.href
  }
  return String(first)
}

export async function generateImage(
  prompt: string,
  orientation: 'hero' | 'section_break',
): Promise<Buffer | null> {
  try {
    const aspectRatio = orientation === 'hero' ? '16:9' : '3:4'

    const output = await replicate.run('black-forest-labs/flux-schnell', {
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: 'jpg',
        output_quality: 85,
        num_outputs: 1,
        go_fast: true,
      },
    })

    const imageUrl = await resolveImageUrl(output)
    if (!imageUrl) return null

    const response = await fetch(imageUrl)
    if (!response.ok) return null

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    console.error('Replicate image generation failed:', err)
    return null
  }
}
