'use client'

import { useTranslations } from 'next-intl'
import { AdminTripsTable } from '@/components/admin/admin-trips-table'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { PollIntervalForm } from '@/components/admin/poll-interval-form'
import { EditEnabledForm } from '@/components/admin/edit-enabled-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminDashboardData } from '@/lib/queries'

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const t = useTranslations('Admin')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('pollTitle')}</CardTitle>
          <CardDescription>{t('pollDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PollIntervalForm current={data.pollIntervalMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t('editTitle')}</CardTitle>
            {data.editGloballyEnabled ? (
              <Badge variant="secondary">{t('editBadgeEnabled')}</Badge>
            ) : (
              <Badge variant="outline">{t('editBadgeDisabled')}</Badge>
            )}
          </div>
          <CardDescription>{t('editDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditEnabledForm enabled={data.editGloballyEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('users')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={data.users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('trips')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTripsTable rows={data.trips} />
        </CardContent>
      </Card>
    </div>
  )
}
