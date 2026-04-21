import { requireAdmin } from '@/lib/session'
import { AdminDashboard } from '@/components/admin/admin-dashboard'

export default async function AdminPage() {
  await requireAdmin()
  return <AdminDashboard />
}
