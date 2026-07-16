/**
 * Normalize ai_config jsonb boolean-ish values.
 * Handles boolean, "true"/"false" strings, and JSON-quoted variants.
 */
export function parseAiConfigBoolean(value: unknown, defaultValue = false): boolean {
  if (value === null || value === undefined) return defaultValue
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0

  const raw = String(value)
    .trim()
    .toLowerCase()
    .replace(/^"+|"+$/g, '')

  if (raw === 'true' || raw === '1' || raw === 'yes') return true
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === '') return false
  return defaultValue
}
