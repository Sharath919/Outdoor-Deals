import { supabase } from '../lib/supabase'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

const VERCEL_FN_URL = '/api/ai-reading'
const AI_JSON_TIMEOUT_MS = 35_000
const AI_STREAM_CONNECT_MS = 30_000

function getSupabaseFnUrl(): string | null {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  return base ? `${base}/functions/v1/ai-reading` : null
}

/** Abort only until response headers arrive (safe for long SSE bodies). */
async function fetchUntilHeaders(
  url: string,
  init: RequestInit,
  connectTimeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), connectTimeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (error) {
    clearTimeout(timer)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI connection timed out after ${connectTimeoutMs / 1000}s`)
    }
    throw error
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_JSON_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI request timed out after ${timeoutMs / 1000}s`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function fetchAI(url: string, init: RequestInit, stream: boolean): Promise<Response> {
  if (stream) {
    return fetchUntilHeaders(url, init, AI_STREAM_CONNECT_MS)
  }
  return fetchJsonWithTimeout(url, init, AI_JSON_TIMEOUT_MS)
}

async function readApiError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string }
    return data.error || data.message || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

async function tryAiEndpoint(
  url: string,
  init: RequestInit,
  stream: boolean,
  label: string,
): Promise<{ response: Response } | { error: string }> {
  try {
    const res = await fetchAI(url, init, stream)
    if (res.ok) return { response: res }
    const err = await readApiError(res)
    logError(`callAI ${label} non-ok`, null, { status: res.status, err })
    return { error: err }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logError(`callAI ${label} failed`, error)
    return { error: msg }
  }
}

/** Supabase edge first (when deployed), then Vercel `/api/ai-reading`. */
export async function callAI(body: Record<string, unknown>): Promise<Response> {
  const stream = Boolean(body.stream)
  const anonKey = getPublishableKey()
  const token = await getAuthToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token && token !== anonKey) {
    headers.Authorization = `Bearer ${token}`
  }

  const init: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }

  const supabaseFnUrl = getSupabaseFnUrl()

  let lastError = 'AI service unavailable'

  if (supabaseFnUrl && anonKey) {
    const token = await getAuthToken()
    const supabaseAttempt = await tryAiEndpoint(
      supabaseFnUrl,
      {
        method: 'POST',
        headers: buildEdgeHeaders(token),
        body: JSON.stringify(body),
      },
      stream,
      'Supabase',
    )
    if ('response' in supabaseAttempt) return supabaseAttempt.response
    lastError = supabaseAttempt.error
  }

  const vercelAttempt = await tryAiEndpoint(VERCEL_FN_URL, init, stream, 'Vercel')
  if ('response' in vercelAttempt) return vercelAttempt.response
  lastError = vercelAttempt.error

  throw new Error(lastError)
}

function getPublishableKey(): string {
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || ''
}

function getStoredApiKey(): string | null {
  const key = localStorage.getItem('limansa_api_key')?.trim()
  return key || null
}

async function getAuthToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token || getPublishableKey()
}

function buildEdgeHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: getPublishableKey(),
  }
}

function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(`[claudeApi] ${context}`, error, extra ?? '')
}

function toUserFriendlyError(error: unknown, context: string): string {
  logError(context, error)

  if (!import.meta.env.VITE_SUPABASE_URL) {
    return 'Configuration error - please contact support'
  }

  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error')

  if (
    message === 'Failed to fetch' ||
    (error instanceof TypeError &&
      (message.includes('fetch') || message.includes('network')))
  ) {
    return 'Connection failed - please try again'
  }

  if (message.includes('VITE_SUPABASE') || message.includes('Configuration')) {
    return 'Configuration error - please contact support'
  }

  if (message.includes('504') || message.toLowerCase().includes('gateway timeout')) {
    return 'The reading timed out on the server. Tap Retry — it will use a faster mode.'
  }

  if (message.startsWith('model:') || message.includes('model not found')) {
    return 'AI model unavailable on your API key. Redeploy the latest app build or set ANTHROPIC_MODEL=claude-haiku-4-5 on Vercel.'
  }

  if (message.includes('AI service unavailable')) {
    return 'AI is not reachable. Check that ANTHROPIC_API_KEY is set on Vercel, then redeploy.'
  }

  if (message.includes('not configured') || message.includes('ANTHROPIC_API_KEY')) {
    return message
  }

  if (message.length > 0 && message.length < 240 && !message.startsWith('TypeError')) {
    return message
  }

  return 'Reading failed - please try again'
}

function isTimeoutError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return (
    msg.includes('504') ||
    msg.toLowerCase().includes('timeout') ||
    msg.toLowerCase().includes('timed out')
  )
}

async function simulateTypewriter(
  text: string,
  onChunk: (chunk: string) => void,
  onComplete: (fullText: string) => void,
): Promise<void> {
  const parts = text.match(/\S+\s*|\n/g) ?? [text]
  for (const part of parts) {
    onChunk(part)
    await new Promise((resolve) => setTimeout(resolve, 14))
  }
  onComplete(text)
}

async function fetchReadingViaProxy(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await callAI({
    messages,
    systemPrompt,
    maxTokens,
    stream: false,
  })

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `Reading failed (${response.status})`)
  }

  const data = (await response.json()) as { content?: string; error?: string }
  if (data.error) throw new Error(data.error)

  const text = data.content?.trim() ?? ''
  if (!text) throw new Error('Empty reading response')
  return text
}

async function fetchAnthropicDirect(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: false,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(
      err.error?.message || `API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }
  const text = data.content?.[0]?.text
  if (!text) throw new Error('Empty reading response')
  return text
}

async function streamWithFallback(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  onChunk: (text: string) => void,
  onComplete: (fullText: string) => void,
  onError: (message: string) => void,
  context: string,
): Promise<void> {
  let lastError: unknown = null
  const capped = Math.min(maxTokens, 512)
  const tokenAttempts = [capped, 384]

  for (const tokens of tokenAttempts) {
    try {
      const text = await fetchReadingViaProxy(messages, systemPrompt, tokens)
      await simulateTypewriter(text, onChunk, onComplete)
      return
    } catch (error) {
      lastError = error
      logError(`${context} proxy failed (${tokens} tokens)`, error)
      if (!isTimeoutError(error)) break
    }
  }

  const apiKey = getStoredApiKey()
  if (apiKey) {
    console.warn(
      '[claudeApi] Server proxy unavailable; using browser API key fallback',
    )
    try {
      const text = await fetchAnthropicDirect(
        apiKey,
        messages,
        systemPrompt,
        tokenAttempts[tokenAttempts.length - 1]!,
      )
      await simulateTypewriter(text, onChunk, onComplete)
      return
    } catch (fallbackError) {
      logError(`${context} direct API fallback failed`, fallbackError)
      onError(toUserFriendlyError(fallbackError, `${context} fallback`))
      return
    }
  }

  onError(toUserFriendlyError(lastError, context))
}

async function streamEdgeCompletion(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  onChunk: (text: string) => void,
  onComplete: (fullText: string) => void,
  onError: (message: string) => void,
  context = 'stream',
): Promise<void> {
  await streamWithFallback(
    messages,
    systemPrompt,
    maxTokens,
    onChunk,
    onComplete,
    onError,
    context,
  )
}

export interface StreamReadingPersona {
  systemPrompt: string
  name: string
}

export interface StreamReadingCard {
  name: string
  reversed: boolean
}

interface StreamReadingParams {
  persona: StreamReadingPersona
  cards: StreamReadingCard[]
  spread: { name: string; positions: string[] }
  question: string
  history: Array<{ role: string; content: string }>
  onChunk: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (error: string) => void
}

export async function streamReading({
  persona,
  cards,
  spread,
  question,
  history,
  onChunk,
  onComplete,
  onError,
}: StreamReadingParams) {
  const cardList = cards
    .map(
      (c, i) =>
        `${spread.positions[i]}: ${c.name} (${c.reversed ? 'Reversed' : 'Upright'})`,
    )
    .join('\n')

  const userMessage = `Question: "${question}"

Spread: ${spread.name}
Cards drawn:
${cardList}

Give a reading that weaves all cards into one flowing narrative addressing this question directly. Do not list cards mechanically. Tell a story.`

  const messages = [...history, { role: 'user', content: userMessage }]

  await streamEdgeCompletion(
    messages,
    persona.systemPrompt,
    512,
    onChunk,
    onComplete,
    onError,
    'streamReading',
  )
}

export async function streamFollowUp({
  systemPrompt,
  question,
  history,
  onChunk,
  onComplete,
  onError,
}: {
  systemPrompt: string
  question: string
  history: Array<{ role: string; content: string }>
  onChunk: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (message: string) => void
}) {
  const messages = [...history, { role: 'user', content: question }]
  await streamEdgeCompletion(
    messages,
    systemPrompt,
    512,
    onChunk,
    onComplete,
    onError,
    'streamFollowUp',
  )
}

const DAILY_LUNA_SYSTEM = `You are Luna, a poetic tarot reader. Give a short daily reflection (3-4 sentences) for someone who drew this card today. Speak directly to them. Be specific to the card's energy. End with one actionable intention for the day.`

export async function streamDailyReflection({
  cardName,
  reversed,
  dayOfWeek,
  dateLabel,
  onChunk,
  onComplete,
  onError,
}: {
  cardName: string
  reversed: boolean
  dayOfWeek: string
  dateLabel: string
  onChunk: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (message: string) => void
}) {
  const orientation = reversed ? 'Reversed' : 'Upright'
  const userMessage = `Today's card: ${cardName} (${orientation}). Today's date: ${dayOfWeek}, ${dateLabel}. Give a brief daily reflection.`

  await streamEdgeCompletion(
    [{ role: 'user', content: userMessage }],
    DAILY_LUNA_SYSTEM,
    512,
    onChunk,
    onComplete,
    onError,
    'streamDailyReflection',
  )
}

/** Streaming completion for arbitrary messages (e.g. Yes/No oracle). */
export async function streamEdgeMessages(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  maxTokens: number,
  onChunk: (text: string) => void,
  onComplete: (fullText: string) => void,
  onError: (message: string) => void,
) {
  await streamEdgeCompletion(
    messages,
    systemPrompt,
    maxTokens,
    onChunk,
    onComplete,
    onError,
    'streamEdgeMessages',
  )
}

export async function generateReading(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 512,
): Promise<string> {
  const messages = [{ role: 'user', content: userMessage }]
  let lastError: unknown = null

  try {
    const response = await callAI({
      messages,
      systemPrompt,
      maxTokens,
      stream: false,
    })
    const data = (await response.json()) as {
      content?: string
      error?: string
    }
    if (!response.ok) {
      throw new Error(data.error || `Reading failed (${response.status})`)
    }
    if (data.content) return data.content
    throw new Error(data.error || 'Empty reading response')
  } catch (error) {
    lastError = error
    logError('generateReading AI proxy failed (Supabase → Vercel)', error)
  }

  const apiKey = getStoredApiKey()
  if (apiKey) {
    try {
      return await fetchAnthropicDirect(apiKey, messages, systemPrompt, maxTokens)
    } catch (fallbackError) {
      logError('generateReading fallback failed', fallbackError)
      throw new Error(toUserFriendlyError(fallbackError, 'generateReading fallback'))
    }
  }

  throw new Error(toUserFriendlyError(lastError, 'generateReading'))
}
