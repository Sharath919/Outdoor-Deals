/**
 * Shared article create/edit form (writer portal + admin).
 */

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ArticleFormData, ArticleTemplate } from '@/types/article'
import { OUTDOOR_CATEGORY_OPTIONS } from '@/config/outdoorCategories'
import { SITE_URL } from '@/config/site'
import { generateSlug, isSlugAvailable, suggestAvailableSlug } from '@/utils/articles'
import { supabase } from '@/lib/supabase'
import SectionBreakDialog from '@/components/admin/SectionBreakDialog'

const JSON_IMPORT_KEYS = [
  'title',
  'slug',
  'meta_description',
  'seo_title',
  'template_type',
  'category',
  'topic',
  'canonical_url',
] as const satisfies readonly (keyof ArticleFormData)[]

type JsonImportKey = (typeof JSON_IMPORT_KEYS)[number]

function parseClaudeImportJson(raw: string): Record<JsonImportKey, string> | 'invalid' | 'empty' {
  let text = raw.trim()
  if (!text) return 'empty'

  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return 'invalid'
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'invalid'
  }

  const source = parsed as Record<string, unknown>
  const result: Partial<Record<JsonImportKey, string>> = {}

  for (const key of JSON_IMPORT_KEYS) {
    let value = source[key]
    if (value === undefined || value === null) {
      if (key === 'topic') value = source.card_id
      else continue
    }
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value.trim()
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = String(value)
    }
  }

  if (Object.keys(result).length === 0) return 'empty'
  return result as Record<JsonImportKey, string>
}

interface ArticleFormProps {
  articleId?: string
  initialData?: Partial<ArticleFormData>
  submitError?: string | null
  onSubmit: (
    data: ArticleFormData,
    action: 'save-draft' | 'submit-review' | 'publish',
  ) => Promise<void>
  isAdmin?: boolean
  isLoading?: boolean
}

const TEMPLATE_OPTIONS: { value: ArticleTemplate | ''; label: string }[] = [
  { value: '', label: 'Select template…' },
  { value: 'roundup-under-budget', label: 'Best X Under $Y' },
  { value: 'best-of-category', label: 'Best of Category' },
  { value: 'comparison', label: 'Comparison / Vs' },
  { value: 'buying-guide', label: 'Buying Guide' },
  { value: 'other', label: 'Other' },
]

const VALID_TEMPLATE_VALUES = TEMPLATE_OPTIONS.map((o) => o.value).filter(
  (v): v is ArticleTemplate => v !== '',
)

function isArticleTemplate(value: string): value is ArticleTemplate {
  return (VALID_TEMPLATE_VALUES as readonly string[]).includes(value)
}

const EMPTY_FORM: ArticleFormData = {
  title: '',
  slug: '',
  meta_description: '',
  content_html: '',
  hero_image_url: '',
  atmosphere_image_url: '',
  topic: '',
  template_type: '',
  category: '',
  seo_title: '',
  canonical_url: '',
  status: 'draft',
}

const GUIDES_PATH_PREFIX = `${SITE_URL.replace(/\/$/, '')}/guides/`

export default function ArticleForm({
  articleId,
  initialData,
  submitError,
  onSubmit,
  isAdmin,
  isLoading,
}: ArticleFormProps) {
  const [form, setForm] = useState<ArticleFormData>({ ...EMPTY_FORM, ...initialData })
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialData?.slug)
  const [charCount, setCharCount] = useState({
    title: initialData?.title?.length ?? 0,
    meta: initialData?.meta_description?.length ?? 0,
  })
  const [importOpen, setImportOpen] = useState(false)
  const [sectionBreakOpen, setSectionBreakOpen] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importMessage, setImportMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [suggestingSlug, setSuggestingSlug] = useState(false)
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (initialData) {
      setForm({ ...EMPTY_FORM, ...initialData })
      setSlugManuallyEdited(!!initialData.slug)
      setCharCount({
        title: initialData.title?.length ?? 0,
        meta: initialData.meta_description?.length ?? 0,
      })
    }
  }, [initialData])

  useEffect(() => {
    if (!slugManuallyEdited && form.title) {
      setForm((f) => ({ ...f, slug: generateSlug(form.title) }))
    }
  }, [form.title, slugManuallyEdited])

  useEffect(() => {
    const slug = form.slug.trim()
    if (!slug) {
      setSlugStatus('idle')
      return
    }

    setSlugStatus('checking')
    const timer = window.setTimeout(async () => {
      const available = await isSlugAvailable(slug, articleId)
      setSlugStatus(available ? 'available' : 'taken')
    }, 400)

    return () => window.clearTimeout(timer)
  }, [form.slug, articleId])

  const slugTaken = slugStatus === 'taken'

  async function applySuggestedSlug() {
    setSuggestingSlug(true)
    const next = await suggestAvailableSlug(form.slug, articleId)
    setForm((f) => ({ ...f, slug: next }))
    setSlugManuallyEdited(true)
    setSuggestingSlug(false)
  }

  const set =
    (field: keyof ArticleFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.value
      setForm((f) => ({ ...f, [field]: value }))
      if (field === 'title') setCharCount((c) => ({ ...c, title: value.length }))
      if (field === 'meta_description') setCharCount((c) => ({ ...c, meta: value.length }))
      if (field === 'slug') setSlugManuallyEdited(true)
    }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let uploadBody: Blob
    let uploadName = file.name.replace(/\s/g, '-').replace(/\.[^.]+$/, '') + '.jpg'

    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not available')
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      uploadBody = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not convert image to JPEG'))),
          'image/jpeg',
          0.92,
        )
      })
    } catch {
      alert('Could not process this image. Please upload a JPG or PNG file.')
      return
    }

    const fileName = `articles/${Date.now()}-${uploadName}`
    const { error } = await supabase.storage.from('article-images').upload(fileName, uploadBody, {
      upsert: true,
      contentType: uploadBody.type || 'image/jpeg',
    })
    if (error) {
      alert(`Upload failed: ${error.message}`)
      return
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('article-images').getPublicUrl(fileName)
    setForm((f) => ({
      ...f,
      hero_image_url: publicUrl,
    }))
  }

  const insertContentAtCursor = (snippet: string) => {
    const el = contentTextareaRef.current
    if (!el) {
      setForm((f) => ({ ...f, content_html: f.content_html + snippet }))
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const next = el.value.slice(0, start) + snippet + el.value.slice(end)
    setForm((f) => ({ ...f, content_html: next }))
    const pos = start + snippet.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const handleJsonImport = () => {
    setImportMessage(null)
    const parsed = parseClaudeImportJson(importJson)

    if (parsed === 'invalid') {
      setImportMessage({ type: 'error', text: 'Invalid JSON — check the format' })
      return
    }
    if (parsed === 'empty') {
      setImportMessage({ type: 'error', text: 'No matching fields found' })
      return
    }

    const count = Object.keys(parsed).length
    const { template_type: importedTemplate, ...rest } = parsed
    setForm((f) => ({
      ...f,
      ...rest,
      ...(importedTemplate && isArticleTemplate(importedTemplate)
        ? { template_type: importedTemplate }
        : {}),
    }))
    if (parsed.title) {
      setCharCount((c) => ({ ...c, title: parsed.title.length }))
    }
    if (parsed.meta_description) {
      setCharCount((c) => ({ ...c, meta: parsed.meta_description.length }))
    }
    setSlugManuallyEdited(true)
    setImportJson('')
    setImportOpen(false)
    setImportMessage({ type: 'success', text: `✓ ${count} field${count === 1 ? '' : 's'} imported` })
  }

  const inputClass =
    'w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:border-amber-400/50 transition-colors'
  const labelClass = 'block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wide'
  const hintClass = 'text-white/30 text-xs mt-1.5'

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/10 border-l-4 border-l-amber-400/60 bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setImportOpen((o) => !o)
            if (importMessage?.type === 'success') setImportMessage(null)
          }}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className="text-amber-400/90 text-xs font-medium uppercase tracking-wide">
            Import from Claude
          </span>
          {importOpen ? (
            <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
          )}
        </button>

        {importOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-white/8">
            <textarea
              value={importJson}
              onChange={(e) => {
                setImportJson(e.target.value)
                if (importMessage) setImportMessage(null)
              }}
              placeholder='Paste JSON with title, slug, meta_description, template_type, category, topic…'
              rows={6}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
            />
            <button
              type="button"
              onClick={handleJsonImport}
              disabled={!importJson.trim()}
              className="w-full py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm transition-colors disabled:opacity-30"
            >
              Import Fields
            </button>
            {importMessage && (
              <p
                className={`text-xs ${
                  importMessage.type === 'success' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {importMessage.text}
              </p>
            )}
          </div>
        )}

        {!importOpen && importMessage?.type === 'success' && (
          <p className="px-4 pb-3 text-xs text-green-400">{importMessage.text}</p>
        )}
      </div>

      <div>
        <label className={labelClass}>
          Article Title{' '}
          <span className={charCount.title > 65 ? 'text-red-400' : 'text-white/25'}>
            ({charCount.title}/65)
          </span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          placeholder="e.g. Best Camping Tents Under $200 (2026)"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>URL Slug</label>
        <div className="flex items-center gap-2">
          <span className="text-white/25 text-sm shrink-0 hidden sm:inline">/guides/</span>
          <input
            type="text"
            value={form.slug}
            onChange={set('slug')}
            placeholder="best-camping-tents-under-200"
            className={`${inputClass} ${slugTaken ? 'border-red-400/50 focus:border-red-400/70' : ''}`}
          />
        </div>
        {form.slug.trim() && (
          <p className={hintClass}>
            Live URL: {GUIDES_PATH_PREFIX}
            {form.slug.trim()}
          </p>
        )}
        {form.slug.trim() && slugStatus === 'checking' && (
          <p className={hintClass}>Checking slug availability…</p>
        )}
        {slugTaken && (
          <div className="mt-2 space-y-2">
            <p className="text-red-400 text-xs">
              This slug is already in use — change it or use a unique variant below.
            </p>
            <button
              type="button"
              onClick={applySuggestedSlug}
              disabled={suggestingSlug}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
            >
              {suggestingSlug ? 'Finding slug…' : 'Suggest available slug (e.g. -2)'}
            </button>
          </div>
        )}
        {submitError && <p className="text-red-400 text-xs mt-2">{submitError}</p>}
      </div>

      <div>
        <label className={labelClass}>
          Meta Description{' '}
          <span
            className={
              charCount.meta > 160
                ? 'text-red-400'
                : charCount.meta > 140
                  ? 'text-amber-400'
                  : 'text-white/25'
            }
          >
            ({charCount.meta}/160)
          </span>
        </label>
        <textarea
          value={form.meta_description}
          onChange={set('meta_description')}
          placeholder="Short summary for Google — who this guide is for and what they'll learn"
          rows={3}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          SEO Title Override{' '}
          <span className="text-white/20 normal-case font-normal">
            (optional — leave blank to use article title)
          </span>
        </label>
        <input
          type="text"
          value={form.seo_title}
          onChange={set('seo_title')}
          placeholder="Different title for search results if needed"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          Canonical URL{' '}
          <span className="text-white/20 normal-case font-normal">
            (optional — leave blank to use the default /guides/slug URL)
          </span>
        </label>
        <input
          type="url"
          value={form.canonical_url}
          onChange={set('canonical_url')}
          placeholder={`${GUIDES_PATH_PREFIX}your-slug`}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Guide Type</label>
          <select value={form.template_type} onChange={set('template_type')} className={inputClass}>
            {TEMPLATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {form.template_type === 'roundup-under-budget' && (
            <p className={hintClass}>
              Include the budget in the title (e.g. “Under $200”) so readers know what to expect.
            </p>
          )}
        </div>
        <div>
          <label className={labelClass}>Gear Category</label>
          <select value={form.category} onChange={set('category')} className={inputClass}>
            {OUTDOOR_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Primary Topic{' '}
          <span className="text-white/20 normal-case font-normal">
            (optional — used by the article machine &amp; scheduling)
          </span>
        </label>
        <input
          type="text"
          value={form.topic}
          onChange={set('topic')}
          placeholder="e.g. camping tents, ultralight backpacks, hiking boots"
          className={inputClass}
        />
        <p className={hintClass}>
          Short product or topic focus. Helps match this guide to scheduled automation jobs.
        </p>
      </div>

      <div>
        <label className={labelClass}>Hero Image</label>
        <div className="space-y-3">
          {form.hero_image_url && (
            <div className="relative w-full h-40 rounded-lg overflow-hidden border border-white/10">
              <img src={form.hero_image_url} alt="Hero preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, hero_image_url: '' }))}
                className="absolute top-2 right-2 bg-black/60 text-white/70 text-xs px-2 py-1 rounded hover:bg-black/80"
              >
                Remove
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <input
              type="text"
              value={form.hero_image_url}
              onChange={(e) => setForm((f) => ({ ...f, hero_image_url: e.target.value }))}
              placeholder="Paste image URL or upload below"
              className={`${inputClass} flex-1`}
            />
            <label className="shrink-0 cursor-pointer px-4 py-2.5 rounded-lg border border-white/15 text-white/60 text-sm hover:border-amber-400/30 hover:text-white/80 transition-colors">
              Upload
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
          <p className={hintClass}>Recommended: 1200×630 or wider landscape. Shown at the top of the guide.</p>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Article Content (HTML)
          <span className="text-white/20 normal-case font-normal ml-2">
            — paste output from Claude or the article machine
          </span>
        </label>
        <textarea
          ref={contentTextareaRef}
          value={form.content_html}
          onChange={set('content_html')}
          placeholder="Paste HTML with product sections, comparison tables, and affiliate CTAs…"
          rows={20}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => setSectionBreakOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors"
          >
            Insert Section Break
          </button>
          <SectionBreakDialog
            open={sectionBreakOpen}
            onOpenChange={setSectionBreakOpen}
            onInsert={insertContentAtCursor}
          />
          <p className="text-white/25 text-xs">
            {form.content_html.length.toLocaleString()} characters
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={() => onSubmit({ ...form, status: 'draft' }, 'save-draft')}
          disabled={isLoading || !form.title || !form.slug || slugTaken}
          className="px-5 py-2.5 rounded-lg border border-white/15 text-white/60 text-sm hover:border-white/30 hover:text-white/80 transition-colors disabled:opacity-30"
        >
          Save Draft
        </button>

        <button
          type="button"
          onClick={() => onSubmit({ ...form, status: 'review' }, 'submit-review')}
          disabled={isLoading || !form.title || !form.slug || !form.content_html || slugTaken}
          className="px-5 py-2.5 rounded-lg border border-amber-400/30 text-amber-400 text-sm hover:bg-amber-400/10 transition-colors disabled:opacity-30"
        >
          Submit for Review
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onSubmit({ ...form, status: 'published' }, 'publish')}
            disabled={isLoading || !form.title || !form.slug || !form.content_html || slugTaken}
            className="px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm transition-colors disabled:opacity-30"
          >
            {isLoading ? 'Publishing…' : 'Publish Now'}
          </button>
        )}
      </div>
    </div>
  )
}
