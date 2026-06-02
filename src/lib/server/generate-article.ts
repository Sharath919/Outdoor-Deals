/** Automated article pipeline: generate → Replicate hero → publish to Supabase. */

import { createClient } from '@supabase/supabase-js'

import { generateImage } from '@/lib/server/api-lib/replicate-image'
import {
  parseClaudeArticleJson,
  repairBrokenArticleHtml,
} from '@/lib/article-content'
import { runAffiliatePipeline, linkProductsToArticle } from '@/lib/server/affiliate-pipeline'
import { isAdminAccessToken, isCronSecretToken } from '@/lib/server/admin-auth'
import { TEMPLATE_HUMAN_NAMES } from '@/config/articleMachinePrompts'
import { getBuiltInArticleMachinePrompt } from '@/config/defaultArticleMachinePrompts'
import { readAmazonAffiliateServerConfig } from '@/lib/server/amazon-affiliate-config'
import { marked } from 'marked'

export const maxDuration = 180

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const REPLICATE_IMAGE_MODEL = 'flux-schnell'
const REPLICATE_IMAGE_COST_USD = 0.003 // sync with src/config/apiCosts.ts replicate.flux-schnell

function getReplicateApiToken(): string {
  return (process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '').trim()
}

type PublishingScheduleRow = {
  id: string
  card_name: string
  template_type: string
  scheduled_date: string
  status: string
  article_id: string | null
  error_text: string | null
  updated_at: string
  destination?: null
  wp_post_id?: number | null
  wp_post_url?: string | null
}

type ApiUsageInsert = {
  article_id: string | null
  schedule_id: string | null
  provider: 'claude' | 'replicate'
  model: string
  operation: 'article_generation' | 'hero_image' | 'section_break_image'
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cost_usd?: number
  duration_ms?: number
  success?: boolean
  error_text?: string | null
  prompt_key?: string | null
}

function templateTypeToPromptConfigKey(templateType: string): string {
  return `article_machine_prompt_${templateType.trim().replace(/-/g, '_')}`
}

async function resolveArticleMachinePrompt(
  supabase: any,
  templateType: string,
): Promise<{ systemPrompt: string; promptKey: string; usedTemplatePrompt: boolean }> {
  const templatePromptKey = templateTypeToPromptConfigKey(templateType)
  const config = await readAiConfigMap(supabase, [
    templatePromptKey,
    'article_machine_prompt_default',
    'article_machine_prompt',
  ])
  const templatePrompt = config[templatePromptKey] ?? ''
  const hasTemplatePrompt = Boolean(templatePrompt.trim())

  if (hasTemplatePrompt) {
    return {
      systemPrompt: templatePrompt,
      promptKey: templatePromptKey,
      usedTemplatePrompt: true,
    }
  }

  const builtInForTemplate = getBuiltInArticleMachinePrompt(templatePromptKey)
  if (builtInForTemplate) {
    return {
      systemPrompt: builtInForTemplate,
      promptKey: templatePromptKey,
      usedTemplatePrompt: true,
    }
  }

  const systemPrompt =
    config.article_machine_prompt_default?.trim() ||
    config.article_machine_prompt?.trim() ||
    getBuiltInArticleMachinePrompt('article_machine_prompt_default')

  return {
    systemPrompt,
    promptKey: 'default',
    usedTemplatePrompt: false,
  }
}

const API_COSTS = {
  claude: {
    'claude-sonnet-4-20250514': { input_per_million: 3.0, output_per_million: 15.0 },
    'claude-haiku-4-5-20251001': { input_per_million: 0.8, output_per_million: 4.0 },
  },
} as const

function calculateClaudeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = API_COSTS.claude[model as keyof typeof API_COSTS.claude]
  if (!pricing) return 0
  return (
    (inputTokens / 1_000_000) * pricing.input_per_million +
    (outputTokens / 1_000_000) * pricing.output_per_million
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getServerSupabase() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey) as any
}

function extractBearerToken(request: Request): string {
  const raw = request.headers.get('authorization') || ''
  return raw.replace(/^Bearer\s+/i, '').trim()
}

async function isAdminUser(supabase: any, accessToken: string): Promise<boolean> {
  return isAdminAccessToken(supabase, accessToken)
}

async function canRunPipeline(supabase: any, token: string): Promise<boolean> {
  if (!token) return false
  if (isCronSecretToken(token)) return true
  return isAdminUser(supabase, token)
}

async function uniqueSlug(
  supabase: any,
  base: string,
): Promise<string> {
  const normalized = base.trim().toLowerCase()
  if (!normalized) return `article-${Date.now()}`
  let candidate = normalized
  for (let i = 2; i < 50; i++) {
    const { data, error } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', candidate)
      .limit(1)
    if (error) throw new Error(`Slug check failed: ${error.message}`)
    if (!data || data.length === 0) return candidate
    candidate = `${normalized}-${i}`
  }
  return `${normalized}-${Date.now()}`
}

async function readAiConfigMap(
  supabase: any,
  keys: string[],
): Promise<Record<string, string>> {
  const { data, error } = (await supabase
    .from('ai_config')
    .select('key, value')
    .in('key', keys)) as any
  if (error) throw new Error(`ai_config read failed: ${error.message}`)
  const out: Record<string, string> = {}
  for (const row of data ?? []) {
    const v = row.value
    out[row.key] = typeof v === 'string' ? v : JSON.stringify(v ?? '')
  }
  return out
}

async function callClaude(params: {
  systemPrompt: string
  userMessage: string
  timeoutMs?: number
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userMessage }],
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 70_000),
  })

  const data = (await res.json().catch(() => ({}))) as {
    content?: Array<{ type: string; text?: string }>
    error?: { message?: string }
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  if (!res.ok) {
    throw new Error(data.error?.message || `Claude API error (${res.status})`)
  }
  const text = data.content?.[0]?.text ?? ''
  if (!text.trim()) throw new Error('Empty Claude response')
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:html)?\s*\n?([\s\S]*?)\n?```$/i)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function extractBetweenMarkers(text: string, startPattern: RegExp, endPattern: RegExp): string {
  const startMatch = text.match(startPattern)
  if (!startMatch || startMatch.index === undefined) return ''
  const startIdx = startMatch.index + startMatch[0].length
  const rest = text.slice(startIdx)
  const endMatch = rest.match(endPattern)
  const endIdx = endMatch?.index ?? rest.length
  return stripMarkdownCodeFence(rest.slice(0, endIdx).trim())
}

const HTML_START_PATTERNS = [
  /---\s*HTML\s+CONTENT\s*---\s*\n?/i,
  /---\s*HTML\s+CONTENT\s*---/i,
  /(?:^|\n)\s*PART\s*2[\s:—–-]*(?:HTML\s+CONTENT)?[^\n]*\n/i,
  /(?:^|\n)\s*#{1,3}\s*PART\s*2[^\n]*\n/i,
]

const HTML_END_PATTERNS = [
  /---\s*IMAGE\s+PROMPT\s*---/i,
  /---\s*GEMINI\s+IMAGE\s+PROMPTS/i,
  /---\s*IMAGE\s+PROMPTS/i,
  /(?:^|\n)\s*PART\s*3\b/i,
  /(?:^|\n)\s*#{1,3}\s*PART\s*3\b/i,
  /(?:^|\n)\s*HERO\s+IMAGE\s+PROMPT\s*:/i,
]

const IMAGE_START_PATTERNS = [
  /---\s*GEMINI\s+IMAGE\s+PROMPTS\s*---\s*\n?/i,
  /---\s*GEMINI\s+IMAGE\s+PROMPTS\s*---/i,
  /---\s*IMAGE\s+PROMPTS\s*---\s*\n?/i,
  /(?:^|\n)\s*PART\s*3[\s:—–-]*(?:GEMINI\s+IMAGE\s+PROMPTS)?[^\n]*\n/i,
  /(?:^|\n)\s*#{1,3}\s*PART\s*3[^\n]*\n/i,
]

function extractHtmlCodeBlocks(text: string): string[] {
  return [...text.matchAll(/```html\s*\n?([\s\S]*?)```/gi)].map((m) => m[1].trim()).filter(Boolean)
}

function extractHtmlAfterJson(text: string): string {
  const jsonBlock = text.match(/```json[\s\S]*?```/i)
  const afterJson = jsonBlock ? text.slice(jsonBlock.index! + jsonBlock[0].length) : text
  const tagMatch = afterJson.match(
    /(<(?:article|main|div|section|h[1-6]|p|ul|ol|table|blockquote)[\s\S]*)/i,
  )
  if (!tagMatch) return ''
  let html = tagMatch[1]
  for (const endPattern of HTML_END_PATTERNS) {
    const endMatch = html.match(endPattern)
    if (endMatch?.index !== undefined) {
      html = html.slice(0, endMatch.index)
      break
    }
  }
  return stripMarkdownCodeFence(html.trim())
}

function extractHtmlFromJson(articleJson: Record<string, unknown>): string {
  for (const key of ['content_html', 'html', 'content', 'body_html', 'body', 'article_html']) {
    const value = articleJson[key]
    if (typeof value === 'string' && value.trim()) {
      const cleaned = stripMarkdownCodeFence(value.trim())
      if (cleaned.length > 50) return cleaned
    }
  }
  return ''
}

function extractHtmlContent(claudeText: string, articleJson: Record<string, unknown>): string {
  for (const startPattern of HTML_START_PATTERNS) {
    for (const endPattern of HTML_END_PATTERNS) {
      const content = extractBetweenMarkers(claudeText, startPattern, endPattern)
      if (content.length > 50) return content
    }
  }

  const legacyMatch = claudeText.match(
    /---\s*HTML\s+CONTENT[\s\S]*?---\s*([\s\S]*?)(?:---\s*GEMINI\s+IMAGE\s+PROMPTS|$)/i,
  )
  if (legacyMatch?.[1]?.trim()) {
    const legacy = stripMarkdownCodeFence(legacyMatch[1].trim())
    if (legacy.length > 50) return legacy
  }

  const htmlBlocks = extractHtmlCodeBlocks(claudeText)
  if (htmlBlocks.length) {
    return htmlBlocks.sort((a, b) => b.length - a.length)[0]
  }

  const afterJson = extractHtmlAfterJson(claudeText)
  if (afterJson.length > 50) return afterJson

  return extractHtmlFromJson(articleJson)
}

function extractImageSection(claudeText: string): string {
  for (const startPattern of IMAGE_START_PATTERNS) {
    const section = extractBetweenMarkers(claudeText, startPattern, /$/)
    if (section.trim()) return section
  }

  const heroIdx = claudeText.search(/HERO\s+IMAGE\s+PROMPT\s*:/i)
  if (heroIdx >= 0) return claudeText.slice(heroIdx)

  return ''
}

function extractHeroPrompt(claudeText: string, imageSection: string): string {
  const imageSource = imageSection || claudeText

  const labeledMatch = imageSource.match(
    /HERO\s+IMAGE\s+PROMPT\s*:?\s*\n?([\s\S]*?)(?:\n\s*SECTION\s+BREAK\s+IMAGE\s+PROMPT\s*:|$)/i,
  )
  if (labeledMatch?.[1]?.trim()) return labeledMatch[1].trim()

  const altLabelMatch = imageSource.match(
    /(?:^|\n)\s*IMAGE\s+PROMPT\s*:?\s*\n?([\s\S]*?)(?:\n\s*SECTION\s+BREAK\s+IMAGE\s+PROMPT\s*:|$)/i,
  )
  if (altLabelMatch?.[1]?.trim()) return altLabelMatch[1].trim()

  if (imageSection) {
    const lines = imageSection
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !/^SECTION\s+BREAK/i.test(line) &&
          !/^HERO\s+IMAGE/i.test(line) &&
          !/^IMAGE\s+PROMPT/i.test(line) &&
          !/^---/.test(line),
      )
    if (lines[0]) return lines[0]
  }

  return ''
}

const WORDPRESS_IMAGE_MARKER = '--- IMAGE PROMPT ---'
const ARTICLE_BODY_MARKER = /---\s*ARTICLE-BODY\s*---/i

function extractArticleBodyMarkdown(claudeText: string): string {
  const startMatch = claudeText.match(ARTICLE_BODY_MARKER)
  if (!startMatch || startMatch.index === undefined) return ''
  const afterStart = claudeText.slice(startMatch.index + startMatch[0].length)
  const endMatch = afterStart.match(/---\s*(?:IMAGE\s+PROMPT|GEMINI\s+IMAGE)\s*---/i)
  const endIdx = endMatch?.index ?? afterStart.length
  return afterStart.slice(0, endIdx).trim()
}

function mergeEditorialMarkdown(claudeText: string, contentHtml: string): string {
  const markdown = extractArticleBodyMarkdown(claudeText)
  if (!markdown) return contentHtml
  const editorialHtml = marked.parse(markdown) as string
  if (!editorialHtml.trim()) return contentHtml
  const lacksIntro = !contentHtml.trim() || !/<p\b/i.test(contentHtml.slice(0, 800))
  if (lacksIntro) {
    return `${editorialHtml.trim()}\n\n${contentHtml.trim()}`.trim()
  }
  return contentHtml
}

function findHtmlStartIndex(text: string): number {
  const match = text.match(/<(?:p|article|main|div|section|h[1-6]|ul|ol|table|blockquote)\b/i)
  return match?.index ?? -1
}

function parseWordPressClaudeOutput(
  claudeText: string,
  articleJson: Record<string, unknown>,
): { contentHtml: string; heroPrompt: string; sectionPrompt: string } {
  const markerIndex = claudeText.indexOf(WORDPRESS_IMAGE_MARKER)

  if (markerIndex !== -1) {
    const heroPrompt = claudeText
      .substring(markerIndex + WORDPRESS_IMAGE_MARKER.length)
      .trim()
      .split('\n\n')[0]
      .trim()

    const jsonBlock = claudeText.match(/```json[\s\S]*?```/i)
    const searchFrom = jsonBlock ? jsonBlock.index! + jsonBlock[0].length : 0
    const beforeMarker = claudeText.slice(searchFrom, markerIndex)
    const htmlStart = findHtmlStartIndex(beforeMarker)

    let contentHtml = ''
    if (htmlStart >= 0) {
      contentHtml = beforeMarker.slice(htmlStart).trim()
    } else {
      contentHtml = extractBetweenMarkers(
        claudeText,
        /(?:^|\n)\s*PART\s*2[\s:—–-]*[^\n]*\n/i,
        /---\s*IMAGE\s+PROMPT\s*---/i,
      )
    }

    contentHtml = stripMarkdownCodeFence(contentHtml)

    if (contentHtml.length > 50 || heroPrompt) {
      return { contentHtml, heroPrompt, sectionPrompt: '' }
    }
  }

  const contentHtml = extractHtmlContent(claudeText, articleJson)
  const imageSection = extractImageSection(claudeText)
  const heroPrompt = extractHeroPrompt(claudeText, imageSection)

  return { contentHtml, heroPrompt, sectionPrompt: '' }
}

function parseClaudeOutput(claudeText: string): {
  articleJson: Record<string, any>
  contentHtml: string
  heroPrompt: string
} {
  const articleJson = parseClaudeArticleJson(claudeText)
  const wp = parseWordPressClaudeOutput(claudeText, articleJson)
  const mergedHtml = mergeEditorialMarkdown(claudeText, wp.contentHtml)
  return {
    articleJson,
    contentHtml: repairBrokenArticleHtml(mergedHtml),
    heroPrompt: wp.heroPrompt,
  }
}

async function replicateGenerateAndUpload(params: {
  supabase: any
  prompt: string
  orientation: 'hero' | 'section_break'
  path: string
}): Promise<{
  attempted: boolean
  url: string
  buffer: Buffer | null
  durationMs: number
  success: boolean
  errorText?: string
}> {
  const startedAt = Date.now()
  if (!params.prompt.trim()) {
    return { attempted: false, url: '', buffer: null, durationMs: 0, success: false, errorText: 'No prompt provided' }
  }
  if (!getReplicateApiToken()) {
    return {
      attempted: false,
      url: '',
      buffer: null,
      durationMs: 0,
      success: false,
      errorText: 'REPLICATE_API_TOKEN not set',
    }
  }

  try {
    const buffer = await generateImage(params.prompt, params.orientation)
    if (!buffer) {
      return {
        attempted: true,
        url: '',
        buffer: null,
        durationMs: Date.now() - startedAt,
        success: false,
        errorText: 'Replicate returned no image',
      }
    }

    const { error: upErr } = await params.supabase.storage
      .from('article-images')
      .upload(params.path, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (upErr) {
      console.warn('[generate-article] Storage upload failed:', upErr.message)
      return {
        attempted: true,
        url: '',
        buffer,
        durationMs: Date.now() - startedAt,
        success: false,
        errorText: upErr.message,
      }
    }

    const {
      data: { publicUrl },
    } = params.supabase.storage.from('article-images').getPublicUrl(params.path)
    return { attempted: true, url: publicUrl, buffer, durationMs: Date.now() - startedAt, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[generate-article] Replicate exception:', message)
    return {
      attempted: true,
      url: '',
      buffer: null,
      durationMs: Date.now() - startedAt,
      success: false,
      errorText: message,
    }
  }
}

async function logApiUsage(supabase: any, row: ApiUsageInsert): Promise<void> {
  try {
    await supabase.from('api_usage_log').insert({
      article_id: row.article_id,
      schedule_id: row.schedule_id,
      provider: row.provider,
      model: row.model,
      operation: row.operation,
      input_tokens: row.input_tokens ?? 0,
      output_tokens: row.output_tokens ?? 0,
      total_tokens: row.total_tokens ?? (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
      cost_usd: row.cost_usd ?? 0,
      duration_ms: row.duration_ms ?? 0,
      success: row.success ?? true,
      error_text: row.error_text ?? null,
      prompt_key: row.prompt_key ?? null,
    })
  } catch (err) {
    console.warn('[generate-article] usage log insert failed:', err instanceof Error ? err.message : err)
  }
}

async function resolveProductHeroFallback(
  supabase: any,
  category: string | null | undefined,
): Promise<string> {
  async function pickImage(forCategory: string | null | undefined): Promise<string> {
    let query = supabase
      .from('products')
      .select('image_url')
      .not('image_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (forCategory?.trim()) {
      query = query.eq('category', forCategory.trim())
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      console.warn('[generate-article] product hero fallback query failed:', error.message)
      return ''
    }
    return (data as { image_url?: string | null } | null)?.image_url?.trim() || ''
  }

  if (category?.trim()) {
    const byCategory = await pickImage(category)
    if (byCategory) return byCategory
  }

  return pickImage(null)
}

/** Schedule topic → card_id slug stored on articles (pipeline compat). */
function topicToSlug(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, '-')
}

function resolveArticleTopic(articleJson: Record<string, unknown>, topic: string): string {
  const fromJson = String(articleJson.card_id ?? articleJson.topic ?? '').trim()
  if (fromJson) return fromJson
  return topicToSlug(topic)
}

export async function handlePost(request: Request): Promise<Response> {
  const supabase = getServerSupabase()
  if (!supabase) return jsonResponse({ error: 'Server configuration error' }, 500)

  const token = extractBearerToken(request)
  if (!(await canRunPipeline(supabase, token))) return jsonResponse({ error: 'Unauthorized' }, 401)

  const body = (await request.json().catch(() => ({}))) as {
    card_name?: string
    template_type?: string
    schedule_id?: string
  }

  const cardName = (body.card_name || '').trim()
  const templateType = (body.template_type || '').trim()
  const scheduleId = (body.schedule_id || '').trim()

  if (!cardName || !templateType || !scheduleId) {
    return jsonResponse({ error: 'card_name, template_type, schedule_id are required' }, 400)
  }

  try {
    // Guard against double-runs / parallel runs on the same schedule row.
    const { data: existing, error: schedErr } = (await supabase
      .from('publishing_schedule')
      .select('status, article_id')
      .eq('id', scheduleId)
      .maybeSingle()) as any
    if (schedErr) throw new Error(`publishing_schedule read failed: ${schedErr.message}`)
    if (existing?.status === 'processing') {
      return jsonResponse({ error: 'This schedule item is already processing' }, 409)
    }
    if (existing?.status === 'done' && existing?.article_id) {
      return jsonResponse({
        success: true,
        article_id: existing.article_id,
        message: 'Already published',
      })
    }

    await supabase
      .from('publishing_schedule')
      .update({ status: 'processing', error_text: null, updated_at: new Date().toISOString() })
      .eq('id', scheduleId)

    let systemPrompt = ''
    let articlePromptKey: string | null = null

    {
      const resolved = await resolveArticleMachinePrompt(supabase, templateType)
      systemPrompt = resolved.systemPrompt.trim()
      articlePromptKey = resolved.usedTemplatePrompt ? resolved.promptKey : 'default'
      console.log(
        `[generate-article] Using ${resolved.usedTemplatePrompt ? resolved.promptKey : 'default'} prompt for ${templateType}`,
      )
    }

    if (!systemPrompt?.trim()) {
      throw new Error('Article machine system prompt not configured')
    }

    const templateHuman = TEMPLATE_HUMAN_NAMES[templateType] || templateType
    const userMessage = `Write a detailed commercial affiliate buying guide article about: ${cardName}. Template style: ${templateHuman}. Target outdoor/camping readers. Include product comparison sections and clear Amazon affiliate CTAs.`

    const claudeStartedAt = Date.now()
    let claudeText = ''
    let claudeInputTokens = 0
    let claudeOutputTokens = 0
    try {
      const claudeResult = await callClaude({
        systemPrompt,
        userMessage,
        timeoutMs: 100_000,
      })
      claudeText = claudeResult.text
      claudeInputTokens = claudeResult.inputTokens
      claudeOutputTokens = claudeResult.outputTokens
      await logApiUsage(supabase, {
        article_id: null,
        schedule_id: scheduleId,
        provider: 'claude',
        model: CLAUDE_MODEL,
        operation: 'article_generation',
        input_tokens: claudeInputTokens,
        output_tokens: claudeOutputTokens,
        total_tokens: claudeInputTokens + claudeOutputTokens,
        cost_usd: calculateClaudeCost(CLAUDE_MODEL, claudeInputTokens, claudeOutputTokens),
        duration_ms: Date.now() - claudeStartedAt,
        success: true,
        prompt_key: articlePromptKey,
      })
    } catch (claudeErr) {
      const message = claudeErr instanceof Error ? claudeErr.message : String(claudeErr)
      await logApiUsage(supabase, {
        article_id: null,
        schedule_id: scheduleId,
        provider: 'claude',
        model: CLAUDE_MODEL,
        operation: 'article_generation',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        duration_ms: Date.now() - claudeStartedAt,
        success: false,
        error_text: message,
        prompt_key: articlePromptKey,
      })
      throw claudeErr
    }

    const { articleJson, contentHtml: rawContentHtml, heroPrompt } = parseClaudeOutput(claudeText)
    const articleTopic = resolveArticleTopic(articleJson, cardName)

    let contentHtml = rawContentHtml
    let hydratedProducts: Awaited<ReturnType<typeof runAffiliatePipeline>>['spec']['products'] = []

    try {
      const pipeline = await runAffiliatePipeline(supabase, {
        contentHtml: rawContentHtml,
        articleJson: articleJson as Record<string, unknown>,
      })
      if (pipeline.render.contentHtml.trim()) {
        contentHtml = pipeline.render.contentHtml
        hydratedProducts = pipeline.spec.products
        console.log('[generate-article] parsed spec:', {
          introLen: pipeline.spec.intro?.length ?? 0,
          buyersGuideLen: pipeline.spec.buyers_guide?.length ?? 0,
          tailLen: pipeline.spec.tail_html?.length ?? 0,
          productCount: pipeline.spec.products.length,
        })
        if (pipeline.warnings.length) {
          console.warn('[generate-article] pipeline warnings:', pipeline.warnings.join('; '))
        }
      }
    } catch (pipelineErr) {
      console.warn(
        '[generate-article] affiliate pipeline skipped:',
        pipelineErr instanceof Error ? pipelineErr.message : pipelineErr,
      )
    }

    const heroImgPath = `articles/heroes/${scheduleId}-hero.jpg`

    if (!contentHtml?.trim()) {
      const markers = {
        hasImagePromptMarker: claudeText.includes(WORDPRESS_IMAGE_MARKER),
        hasHtmlMarker: /HTML\s+CONTENT/i.test(claudeText),
        hasHtmlTag: /<(?:p|h[1-6]|article)\b/i.test(claudeText),
        hasHtmlFence: /```html/i.test(claudeText),
        claudeLength: claudeText.length,
      }
      console.error('[generate-article] HTML parse failed:', markers)
      throw new Error(
        `Article body is empty — could not extract HTML (markers: ${JSON.stringify(markers)})`,
      )
    }

    let finalHeroUrl = ''
    if (heroPrompt.trim()) {
      const heroImageResult = await replicateGenerateAndUpload({
        supabase,
        prompt: heroPrompt,
        orientation: 'hero',
        path: heroImgPath,
      })
      if (heroImageResult.attempted) {
        await logApiUsage(supabase, {
          article_id: null,
          schedule_id: scheduleId,
          provider: 'replicate',
          model: REPLICATE_IMAGE_MODEL,
          operation: 'hero_image',
          cost_usd: heroImageResult.success ? REPLICATE_IMAGE_COST_USD : 0,
          duration_ms: heroImageResult.durationMs,
          success: heroImageResult.success,
          error_text: heroImageResult.errorText,
        })
      }
      finalHeroUrl = heroImageResult.success ? heroImageResult.url : ''
      if (!finalHeroUrl) {
        console.warn('[generate-article] Replicate hero unavailable; trying product fallback')
      }
    } else {
      console.warn('[generate-article] No IMAGE PROMPT in Claude output; trying product fallback')
    }

    if (!finalHeroUrl) {
      finalHeroUrl = await resolveProductHeroFallback(
        supabase,
        String(articleJson.category || '').trim() || null,
      )
      if (finalHeroUrl) {
        console.log('[generate-article] Using product catalog image as hero fallback')
      }
    }

    const slug = await uniqueSlug(
      supabase,
      String(articleJson.slug || '').trim() || topicToSlug(cardName),
    )

    const amazonConfig = await readAmazonAffiliateServerConfig()
    const authorName = amazonConfig.authorName?.trim() || 'Outdoor Deals Team'

    const { data: article, error: insertError } = await supabase
      .from('articles')
      .insert({
        title: articleJson.title || cardName,
        slug,
        meta_description: articleJson.meta_description,
        seo_title: articleJson.seo_title,
        template_type: articleJson.template_type || templateType,
        category: articleJson.category,
        card_id: articleTopic || null,
        content_html: contentHtml,
        hero_image_url: finalHeroUrl || null,
        atmosphere_image_url: finalHeroUrl || null,
        status: 'published',
        author_name: authorName,
        published_at: new Date().toISOString(),
      })
      .select('id, slug')
      .single()

    if (insertError) throw new Error(`Database insert failed: ${insertError.message}`)

    if (hydratedProducts.length > 0) {
      try {
        await linkProductsToArticle(
          supabase,
          article.id,
          hydratedProducts,
          String(articleJson.category || '').trim() || null,
        )
      } catch (linkErr) {
        console.warn(
          '[generate-article] product linking failed:',
          linkErr instanceof Error ? linkErr.message : linkErr,
        )
      }
    }

    await supabase
      .from('api_usage_log')
      .update({ article_id: article.id })
      .eq('schedule_id', scheduleId)

    await supabase
      .from('publishing_schedule')
      .update({
        status: 'done',
        article_id: article.id,
        error_text: null,
        updated_at: new Date().toISOString(),
      } satisfies Partial<PublishingScheduleRow>)
      .eq('id', scheduleId)

    return jsonResponse({
      success: true,
      article_id: article.id,
      slug: article.slug,
      hero_url: finalHeroUrl || null,
    })
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err)
    if (/aborted due to timeout|TimeoutError|AbortError/i.test(message)) {
      message =
        'Generation timed out — Claude took too long with this prompt. Wait for deploy, then retry (timeouts were increased).'
    }
    console.error('[generate-article] failed:', message)
    await supabase
      .from('publishing_schedule')
      .update({
        status: 'failed',
        error_text: message,
        updated_at: new Date().toISOString(),
      } satisfies Partial<PublishingScheduleRow>)
      .eq('id', scheduleId)
    return jsonResponse({ error: message }, 500)
  }
}

export { corsHeaders }

