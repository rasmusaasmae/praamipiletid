import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { getAdminDashboard } from '@/lib/queries'

export default async function AdminPage() {
  const data = await getAdminDashboard()
  return <AdminDashboard data={data} />
}
