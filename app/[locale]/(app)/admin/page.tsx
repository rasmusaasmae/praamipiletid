import { asc, desc, eq, sql } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { tripOptions, trips, user } from '@/db/schema'
import { requireAdmin } from '@/lib/session'
import { getAllSettings } from '@/lib/settings'
import { PollIntervalForm } from '@/components/admin/poll-interval-form'
import { EditEnabledForm } from '@/components/admin/edit-enabled-form'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { AdminTripsTable } from '@/components/admin/admin-trips-table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AdminPage() {
  await requireAdmin()
  const t = await getTranslations('Admin')

  const settings = await getAllSettings()

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      subCount: sql<number>`(select count(*) from ${trips} where ${trips.userId} = ${user.id})`,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .all()

  const rows = await db
    .select({
      id: trips.id,
      userEmail: user.email,
      direction: trips.direction,
      measurementUnit: trips.measurementUnit,
      threshold: trips.threshold,
      active: trips.active,
      eventUid: tripOptions.eventUid,
      eventDate: tripOptions.eventDate,
      eventDtstart: tripOptions.eventDtstart,
      lastCapacity: tripOptions.lastCapacity,
    })
    .from(trips)
    .innerJoin(user, eq(user.id, trips.userId))
    .innerJoin(tripOptions, eq(tripOptions.tripId, trips.id))
    .orderBy(asc(tripOptions.priority), desc(tripOptions.eventDtstart))
    .all()

  const firstByTrip = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    if (!firstByTrip.has(r.id)) firstByTrip.set(r.id, r)
  }
  const adminRows = [...firstByTrip.values()].sort(
    (a, b) => b.eventDtstart.getTime() - a.eventDtstart.getTime(),
  )

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
          <PollIntervalForm current={settings.pollIntervalMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('editTitle')}</CardTitle>
          <CardDescription>{t('editDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditEnabledForm enabled={settings.editGloballyEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('users')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('trips')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTripsTable rows={adminRows} />
        </CardContent>
      </Card>
    </div>
  )
}
