import { desc, eq, sql } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { subscriptions, user } from '@/db/schema'
import { requireAdmin } from '@/lib/session'
import { getAllSettings } from '@/lib/settings'
import { PollIntervalForm } from '@/components/admin/poll-interval-form'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { AdminSubscriptionsTable } from '@/components/admin/admin-subscriptions-table'
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
      subCount: sql<number>`(select count(*) from ${subscriptions} where ${subscriptions.userId} = ${user.id})`,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .all()

  const subs = await db
    .select({
      id: subscriptions.id,
      userEmail: user.email,
      direction: subscriptions.direction,
      date: subscriptions.date,
      tripUid: subscriptions.tripUid,
      departureAt: subscriptions.departureAt,
      capacityType: subscriptions.capacityType,
      threshold: subscriptions.threshold,
      renotifyMode: subscriptions.renotifyMode,
      active: subscriptions.active,
      lastCapacity: subscriptions.lastCapacity,
      lastNotifiedAt: subscriptions.lastNotifiedAt,
    })
    .from(subscriptions)
    .innerJoin(user, eq(user.id, subscriptions.userId))
    .orderBy(desc(subscriptions.departureAt))
    .all()

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
          <CardTitle>{t('users')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('subscriptions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminSubscriptionsTable rows={subs} />
        </CardContent>
      </Card>
    </div>
  )
}
