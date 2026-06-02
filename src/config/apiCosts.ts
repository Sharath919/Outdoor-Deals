// Pricing as of 2026 — update if prices change
export const API_COSTS = {
  claude: {
    'claude-sonnet-4-20250514': {
      input_per_million: 3.0,
      output_per_million: 15.0,
    },
    'claude-haiku-4-5-20251001': {
      input_per_million: 0.8,
      output_per_million: 4.0,
    },
  },
  replicate: {
    'flux-schnell': {
      cost_per_image: 0.003,
    },
    'flux-dev': {
      cost_per_image: 0.025,
    },
    'flux-1.1-pro': {
      cost_per_image: 0.04,
    },
  },
  gemini: {
    'imagen-3.0-generate-001': {
      cost_per_image: 0.04,
    },
    'gemini-pro': {
      input_per_million: 0.5,
      output_per_million: 1.5,
    },
  },
} as const

export function calculateClaudeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = API_COSTS.claude[model as keyof typeof API_COSTS.claude]
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.input_per_million +
    (outputTokens / 1_000_000) * pricing.output_per_million
  )
}

export function calculateReplicateImageCost(
  model: keyof typeof API_COSTS.replicate = 'flux-schnell',
  imageCount = 1,
): number {
  return imageCount * API_COSTS.replicate[model].cost_per_image
}

export function calculateGeminiImageCost(imageCount = 1): number {
  return imageCount * API_COSTS.gemini['imagen-3.0-generate-001'].cost_per_image
}
