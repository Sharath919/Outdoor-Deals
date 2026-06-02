'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

type Product = {
  id: string
  asin: string | null
  title: string
  affiliate_url: string
  category: string | null
  last_price_cents: number | null
}

export default function Products() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Product[]>([])
  const [title, setTitle] = useState('')
  const [asin, setAsin] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('camping')

  async function refresh() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, asin, title, affiliate_url, category, last_price_cents')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) toast.error(error.message)
    else setRows((data as Product[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function addProduct() {
    if (!title.trim() || !url.trim()) return toast.error('Title and affiliate URL required')
    const { error } = await supabase.from('products').insert({
      title: title.trim(),
      asin: asin.trim() || null,
      affiliate_url: url.trim(),
      category: category.trim() || null,
    })
    if (error) return toast.error(error.message)
    toast.success('Product added')
    setTitle('')
    setAsin('')
    setUrl('')
    await refresh()
  }

  if (loading) return <p className="text-foreground/50">Loading products…</p>

  return (
    <div className="space-y-8">
      <div className="rounded-xl p-6 glass border border-white/10 space-y-4 max-w-xl">
        <h2 className="font-semibold text-lg">Add product</h2>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
        <input
          placeholder="ASIN (optional)"
          value={asin}
          onChange={(e) => setAsin(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
        <input
          placeholder="Amazon affiliate URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
        <input
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void addProduct()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white font-medium"
        >
          Save product
        </button>
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left">
            <tr>
              <th className="p-3">Title</th>
              <th className="p-3">ASIN</th>
              <th className="p-3">Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-white/10">
                <td className="p-3">{p.title}</td>
                <td className="p-3 text-foreground/60">{p.asin || '—'}</td>
                <td className="p-3 text-foreground/60">{p.category || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-foreground/50">No products yet.</p>
        )}
      </div>
    </div>
  )
}
