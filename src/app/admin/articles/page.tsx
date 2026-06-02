'use client'

import { Suspense } from 'react'
import AdminArticleList from '@/views/admin/AdminArticleList'

function ArticlesLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <span className="text-sm tracking-[0.2em] text-[#c9a84c]/50">LOADING…</span>
    </div>
  )
}

export default function AdminArticlesPage() {
  return (
    <Suspense fallback={<ArticlesLoading />}>
      <AdminArticleList />
    </Suspense>
  )
}
