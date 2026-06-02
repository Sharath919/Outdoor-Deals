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
import type { ArticleFormData } from '@/types/article'
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
      }
    })
  }, [id])

  const handleSubmit = async (
    data: ArticleFormData,
    _action: 'save-draft' | 'submit-review' | 'publish',
  ) => {
    if (!user) return
    setLoading(true)
    setSaved(false)
    setSubmitError(null)

    const authorName = profile?.name || user.email || 'Admin'
    const result = isNew
      ? await createArticle(data, user.id, authorName)
      : await updateArticle(id!, data, { existingPublishedAt })

    setLoading(false)
    if (result.error) {
      setSubmitError(result.error)
      toast.error(result.error, { duration: 8000 })
      return
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
