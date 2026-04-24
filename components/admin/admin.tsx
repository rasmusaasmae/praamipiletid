'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { AdminTicketsTable } from '@/components/admin/admin-tickets-table'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { PollIntervalForm } from '@/components/admin/poll-interval-form'
import { EditEnabledForm } from '@/components/admin/edit-enabled-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminDashboardQueryOptions } from '@/lib/query-options'

export function Admin() {
  const { data } = useSuspenseQuery(adminDashboardQueryOptions)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Manage system settings, users and tickets.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Poll interval</CardTitle>
          <CardDescription>
            How often we check the praamipiletid.ee API. 5000–600000 ms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PollIntervalForm current={data.pollIntervalMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Auto-swap (global)</CardTitle>
            {data.editGloballyEnabled ? (
              <Badge variant="secondary">Enabled</Badge>
            ) : (
              <Badge variant="outline">Disabled</Badge>
            )}
          </div>
          <CardDescription>
            Globally enable or disable automatic ticket swaps across all users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditEnabledForm enabled={data.editGloballyEnabled} />
        </CardContent>
      </Card>

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
