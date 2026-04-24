'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { AdminTicketsTable } from '@/components/admin/admin-tickets-table'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { adminDashboardQueryOptions } from '@/lib/query-options'

export function Admin() {
  const { data } = useSuspenseQuery(adminDashboardQueryOptions)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage users and tickets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={data.users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTicketsTable rows={data.tickets} />
        </CardContent>
      </Card>
    </div>
  )
}
