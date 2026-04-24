'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteAnyTrip } from '@/actions/admin'
import { useOptimisticMutation } from '@/lib/mutations'
import { adminDashboardQueryOptions, type AdminDashboardData } from '@/lib/query-options'

type Row = {
  id: string
  userEmail: string
  direction: string
  measurementUnit: string
  eventUid: string
  eventDate: string
  eventDtstart: Date
  lastCapacity: number | null
}

export function AdminTripsTable({ rows }: { rows: Row[] }) {
  const t = useTranslations('Admin')
  const tCap = useTranslations('Capacity')
  const tDir = useTranslations('Directions')
  const locale = useLocale()

  const deleteMutation = useOptimisticMutation<string, AdminDashboardData>({
    queryKey: adminDashboardQueryOptions.queryKey,
    mutationFn: (id) => deleteAnyTrip({ id }),
    optimisticUpdate: (old, id) => ({
      ...old,
      trips: old.trips.filter((r) => r.id !== id),
    }),
    successMessage: t('deleted'),
  })

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatDateTime = (d: Date) =>
    `${d.toLocaleDateString(dateTag)} ${d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })}`

  if (rows.length === 0) {
    return <p className="text-muted-foreground">{t('tripsEmpty')}</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnUser')}</TableHead>
            <TableHead>{t('columnTrip')}</TableHead>
            <TableHead>{t('columnType')}</TableHead>
            <TableHead>{t('columnLast')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
            <TableHead className="text-right">{t('columnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const past = r.eventDtstart.getTime() < Date.now()
            return (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.userEmail}</TableCell>
                <TableCell>
                  <div className="font-medium">{tDir(r.direction as 'VK')}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(r.eventDtstart)}
                  </div>
                </TableCell>
                <TableCell>{tCap(r.measurementUnit as 'sv')}</TableCell>
                <TableCell>{r.lastCapacity != null ? `${r.lastCapacity}` : '—'}</TableCell>
                <TableCell>
                  {past ? <Badge variant="secondary">{t('statusPast')}</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(r.id)}
                  >
                    {t('delete')}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
