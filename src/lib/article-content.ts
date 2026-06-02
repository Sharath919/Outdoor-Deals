/** Shared Claude article output parsing — used by generate-article API and fix scripts. */

const PART_HTML_LABELS = [
  '## PART 3 — HTML CONTENT',
  '## PART 3 — HTML',
  '## PART 3',
  'PART 3 — HTML CONTENT',
  'PART 3 — HTML',
  '## PART 2 — HTML CONTENT',
  '## PART 2 — HTML',
  '## PART 2',
  'PART 2 — HTML CONTENT',
  'PART 2 — HTML',
  '--- HTML CONTENT',
  '--- HTML CONTENT ---',
]

export function parseClaudeArticleJson(claudeOutput: string): Record<string, unknown> {
  const jsonMatch = claudeOutput.match(/```json\s*([\s\S]*?)```/i)
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response')
  }
  try {
    return JSON.parse(jsonMatch[1].trim()) as Record<string, unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in Claude response: ${message}`)
  }
}

export function sanitizeArticleHtmlContent(htmlContent: string): string {
  let html = htmlContent

  html = html.replace(/```json[\s\S]*?```/gi, '')
  html = html.replace(/```html[\s\S]*?```/gi, '')
  html = html.replace(/```[\s\S]*?```/g, '')

  html = html.replace(/##\s*PART\s+\d+[^\n]*\n/gi, '')
  html = html.replace(/(?:^|\n)\s*PART\s+\d+[^\n]*\n/gi, '\n')
  html = html.replace(/---[^<\n]*---/g, '')

  const imagePromptsIdx = html.search(/---\s*IMAGE\s+PROMPTS/i)
  if (imagePromptsIdx !== -1) {
    html = html.substring(0, imagePromptsIdx)
  }

  const geminiIdx = html.search(/---\s*GEMINI\s+IMAGE\s+PROMPTS/i)
  if (geminiIdx !== -1) {
    html = html.substring(0, geminiIdx)
  }

  const heroPromptIdx = html.search(/HERO\s+IMAGE\s+PROMPT\s*:/i)
  if (heroPromptIdx !== -1) {
    html = html.substring(0, heroPromptIdx)
  }

  return html.trim()
}

function sliceFromFirstHtmlTag(text: string): string {
  const tagMatch = text.match(
    /(<(?:p|article|main|div|section|h[1-6]|ul|ol|table|blockquote)\b[\s\S]*)/i,
  )
  return tagMatch?.[1]?.trim() ?? ''
}

function contentAfterJsonBlock(claudeOutput: string): string {
  const jsonStart = claudeOutput.indexOf('```json')
  if (jsonStart === -1) return claudeOutput
  const jsonEnd = claudeOutput.indexOf('```', jsonStart + 7)
  if (jsonEnd === -1) return claudeOutput
  return claudeOutput.substring(jsonEnd + 3)
}

export function extractLimansaHtmlFromClaude(claudeOutput: string): string {
  let htmlContent = ''

  for (const pattern of PART_HTML_LABELS) {
    const idx = claudeOutput.indexOf(pattern)
    if (idx !== -1) {
      htmlContent = claudeOutput.substring(idx)
      htmlContent = htmlContent.replace(/^[^\n]*\n?/, '').trim()
      break
    }
  }

  if (!htmlContent || !htmlContent.trim().startsWith('<')) {
    const afterJson = contentAfterJsonBlock(claudeOutput)
    const firstPTag = afterJson.indexOf('<p>')
    if (firstPTag !== -1) {
      htmlContent = afterJson.substring(firstPTag)
    }
  }

  if (!htmlContent || !htmlContent.trim().startsWith('<')) {
    const fromTag = sliceFromFirstHtmlTag(contentAfterJsonBlock(claudeOutput))
    if (fromTag) htmlContent = fromTag
  }

  if (!htmlContent || !htmlContent.trim().startsWith('<')) {
    const firstPTag = claudeOutput.indexOf('<p>')
    if (firstPTag !== -1) {
      htmlContent = claudeOutput.substring(firstPTag)
    }
  }

  if (!htmlContent || !htmlContent.trim().startsWith('<')) {
    const fromTag = sliceFromFirstHtmlTag(claudeOutput)
    if (fromTag) htmlContent = fromTag
  }

  htmlContent = sanitizeArticleHtmlContent(htmlContent)

  const firstP = htmlContent.indexOf('<p>')
  if (firstP > 0) {
    htmlContent = htmlContent.substring(firstP)
  }

  htmlContent = htmlContent.trim()

  if (!htmlContent || !htmlContent.startsWith('<')) {
    console.error(
      '[article-content] Could not extract valid HTML. Claude output preview:',
      claudeOutput.substring(0, 500),
    )
    throw new Error('Could not extract HTML content from Claude response')
  }

  console.log('[article-content] Content extracted successfully. Length:', htmlContent.length)
  console.log('[article-content] Content starts with:', htmlContent.substring(0, 100))

  return htmlContent
}

/** Fix published articles that already contain JSON blocks or PART labels in body HTML. */
export function repairBrokenArticleHtml(contentHtml: string): string {
  if (!contentHtml) return contentHtml
  if (!contentHtml.includes('```json') && !/##\s*PART\s+\d+/i.test(contentHtml)) {
    return contentHtml
  }

  let fixed = sanitizeArticleHtmlContent(contentHtml)
  const firstP = fixed.indexOf('<p>')
  if (firstP > 0) {
    fixed = fixed.substring(firstP)
  }
  return fixed.trim()
}
