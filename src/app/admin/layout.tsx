'use client'

export const dynamic = 'force-dynamic'

import AdminRoute from '@/components/admin/AdminRoute'
import AdminLayout from '@/views/admin/AdminLayout'

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-screen">
      <AdminRoute>
        <AdminLayout>{children}</AdminLayout>
      </AdminRoute>
    </div>
  )
}
