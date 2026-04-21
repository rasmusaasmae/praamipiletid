'use client'

import { useLiveQuery } from '@tanstack/react-db'
import { useTranslations } from 'next-intl'
import {
  adminTripOptionsCollection,
  adminTripsCollection,
  settingsCollection,
  usersCollection,
  type TripOptionRow,
  type UserRow,
} from '@/lib/collections'
import { AdminTripsTable } from '@/components/admin/admin-trips-table'
import { AdminUsersTable } from '@/components/admin/admin-users-table'
import { PollIntervalForm } from '@/components/admin/poll-interval-form'
import { EditEnabledForm } from '@/components/admin/edit-enabled-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const DEFAULT_POLL_INTERVAL_MS = 15_000

export function AdminDashboard() {
  const t = useTranslations('Admin')

  const { data: users } = useLiveQuery((q) => q.from({ u: usersCollection }))
  const { data: settings } = useLiveQuery((q) => q.from({ s: settingsCollection }))
  const { data: adminTrips } = useLiveQuery((q) => q.from({ t: adminTripsCollection }))
  const { data: adminOptions } = useLiveQuery((q) => q.from({ o: adminTripOptionsCollection }))

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]))
  const pollIntervalMs = Number(settingsMap.get('pollIntervalMs') ?? DEFAULT_POLL_INTERVAL_MS)
  const editGloballyEnabled = Number(settingsMap.get('editGloballyEnabled') ?? 0) !== 0

  const tripCountByUser = new Map<string, number>()
  for (const trip of adminTrips) {
    tripCountByUser.set(trip.user_id, (tripCountByUser.get(trip.user_id) ?? 0) + 1)
  }

  const userRows: Array<UserRow & { subCount: number }> = [...users]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .map((u) => ({ ...u, subCount: tripCountByUser.get(u.id) ?? 0 }))

  const usersTableRows = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned,
    createdAt: u.created_at,
    subCount: u.subCount,
  }))

  const emailById = new Map(users.map((u) => [u.id, u.email]))

  const firstOptionByTrip = new Map<string, TripOptionRow>()
  for (const o of [...adminOptions].sort((a, b) => a.priority - b.priority)) {
    if (!firstOptionByTrip.has(o.trip_id)) firstOptionByTrip.set(o.trip_id, o)
  }

  const tripsTableRows = adminTrips
    .map((trip) => {
      const opt = firstOptionByTrip.get(trip.id)
      if (!opt) return null
      return {
        id: trip.id,
        userEmail: emailById.get(trip.user_id) ?? '—',
        direction: trip.direction,
        measurementUnit: trip.measurement_unit,
        eventUid: opt.event_uid,
        eventDate: opt.event_date,
        eventDtstart: opt.event_dtstart,
        lastCapacity: opt.last_capacity,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.eventDtstart.getTime() - a.eventDtstart.getTime())

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
          <PollIntervalForm current={pollIntervalMs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t('editTitle')}</CardTitle>
            {editGloballyEnabled ? (
              <Badge variant="secondary">{t('editBadgeEnabled')}</Badge>
            ) : (
              <Badge variant="outline">{t('editBadgeDisabled')}</Badge>
            )}
          </div>
          <CardDescription>{t('editDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EditEnabledForm enabled={editGloballyEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('users')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable users={usersTableRows} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('trips')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTripsTable rows={tripsTableRows} />
        </CardContent>
      </Card>
    </div>
  )
}
