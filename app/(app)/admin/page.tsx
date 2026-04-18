import { desc, eq, sql } from 'drizzle-orm'
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
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Halda süsteemi seadeid, kasutajaid ja tellimusi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pollimise intervall</CardTitle>
          <CardDescription>
            Kui tihti kontrollime praamipiletid.ee API-t. 5000–600000 ms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PollIntervalForm current={settings.pollIntervalMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kasutajad</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={users} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tellimused</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminSubscriptionsTable rows={subs} />
        </CardContent>
      </Card>
    </div>
  )
}
