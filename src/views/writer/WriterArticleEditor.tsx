'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import ArticleForm from '@/components/admin/ArticleForm'
import {
  createArticle,
  updateArticle,
  getArticleById,
  articleToFormData,
} from '@/utils/articles'
import { publishArticleWithHydration } from '@/utils/publishArticle'
import { supabase } from '@/lib/supabase'
import type { Article, ArticleFormData, ArticleStatus } from '@/types/article'
import { useAuth } from '@/hooks/useAuth'
import { checkIsAdmin } from '@/lib/checkAdmin'

export default function WriterArticleEditor() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : undefined
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const [existing, setExisting] = useState<ArticleFormData | undefined>(undefined)
  const [existingPublishedAt, setExistingPublishedAt] = useState<string | null>(null)
  const [loadedStatus, setLoadedStatus] = useState<ArticleStatus>('draft')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const isNew = !id
  const inAdmin = pathname?.startsWith('/admin/articles') ?? true
  const listPath = '/admin/articles'
  const editBase = '/admin/articles'

  useEffect(() => {
    if (!user) return
    checkIsAdmin(user.id, user.email ?? profile?.email).then(setIsAdmin)
  }, [user, profile])

  useEffect(() => {
    if (!id) return
    getArticleById(id).then((found) => {
      if (found) {
        setExisting(articleToFormData(found))
        setExistingPublishedAt(found.published_at)
        setLoadedStatus(found.status)
      }
    })
  }, [id])

  const handleSubmit = async (
    data: ArticleFormData,
    action: 'save-draft' | 'submit-review' | 'publish',
  ) => {
    if (!user) return
    setLoading(true)
    setSaved(false)
    setSubmitError(null)

    const authorName = profile?.name || user.email || 'Admin'
    const adminPublish = action === 'publish' && (isAdmin || profile?.role === 'admin') && !isNew

    if (adminPublish) {
      const saveResult = await updateArticle(
        id!,
        { ...data, status: loadedStatus },
        { existingPublishedAt },
      )
      if (saveResult.error) {
        setLoading(false)
        setSubmitError(saveResult.error)
        toast.error(saveResult.error, { duration: 8000 })
        return
      }

      const toastId = toast.loading('Hydrating products…', {
        description: 'Then publishing article',
      })
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 120_000)

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) {
          toast.error('Not signed in — refresh and log in again', { id: toastId })
          setLoading(false)
          return
        }

        const { ok, data: publishData } = await publishArticleWithHydration({
          articleId: id!,
          existingPublishedAt,
          accessToken: token,
          signal: controller.signal,
        })

        if (!ok) {
          setSubmitError(publishData.error || 'Publish failed')
          toast.error(publishData.error || 'Publish failed', { id: toastId, duration: 8000 })
          setLoading(false)
          return
        }

        setLoadedStatus('published')
        setSaved(true)
        const hydrateNote = publishData.hydration_skipped
          ? 'Skipped re-hydration (hydrated within 24h)'
          : `Linked ${publishData.products_linked ?? 0} products`
        toast.success(`Published — ${hydrateNote}`, { id: toastId })

        if (Array.isArray(publishData.warnings) && publishData.warnings.length > 0) {
          toast.warning(publishData.warnings.slice(0, 3).join('\n'), { duration: 12_000 })
        }
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'AbortError'
            ? 'Publish timed out after 2 minutes — check Railway logs'
            : err instanceof Error
              ? err.message
              : 'Publish failed'
        setSubmitError(message)
        toast.error(message, { duration: 8000 })
      } finally {
        window.clearTimeout(timeout)
        setLoading(false)
      }
      return
    }

    const result = isNew
      ? await createArticle(data, user.id, authorName)
      : await updateArticle(id!, data, { existingPublishedAt })

    setLoading(false)
    if (result.error) {
      setSubmitError(result.error)
      toast.error(result.error, { duration: 8000 })
      return
    }

    if (result.data?.status) {
      setLoadedStatus((result.data as Article).status)
    }

    setSaved(true)
    toast.success(
      data.status === 'published' ? 'Article published' : 'Draft saved',
    )
    if (isNew && result.data?.id) {
      router.replace(`${editBase}/${result.data.id}/edit`)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href={listPath} className="text-white/30 hover:text-white/60 text-sm transition-colors">
          ← Articles
        </Link>
        <span className="text-white/15">/</span>
        <h1 className="text-xl font-bold text-white">
          {isNew ? 'New Article' : 'Edit Article'}
        </h1>
        {saved && <span className="ml-auto text-green-400 text-sm">✓ Saved</span>}
      </div>

      <ArticleForm
        articleId={id}
        initialData={existing}
        submitError={submitError}
        onSubmit={handleSubmit}
        isAdmin={isAdmin || profile?.role === 'admin'}
        isLoading={loading}
      />
    </div>
  )
}
