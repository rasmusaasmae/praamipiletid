'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
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
import { deleteAnySubscription } from '@/actions/admin'

type Row = {
  id: string
  userEmail: string
  direction: string
  date: string
  tripUid: string
  departureAt: Date
  capacityType: string
  threshold: number
  renotifyMode: string
  active: boolean
  lastCapacity: number | null
  lastNotifiedAt: Date | null
}

export function AdminSubscriptionsTable({ rows }: { rows: Row[] }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Admin')
  const tCap = useTranslations('Capacity')
  const locale = useLocale()

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatDateTime = (d: Date) =>
    `${d.toLocaleDateString(dateTag)} ${d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })}`

  const onDelete = (id: string) => {
    const form = new FormData()
    form.set('id', id)
    startTransition(async () => {
      const res = await deleteAnySubscription(form)
      if (res.ok) toast.success(t('deleted'))
      else toast.error(res.error)
    })
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground">{t('subscriptionsEmpty')}</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnUser')}</TableHead>
            <TableHead>{t('columnTrip')}</TableHead>
            <TableHead>{t('columnType')}</TableHead>
            <TableHead>{t('columnThreshold')}</TableHead>
            <TableHead>{t('columnLast')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
            <TableHead className="text-right">{t('columnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const past = r.departureAt.getTime() < Date.now()
            return (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{r.userEmail}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.direction}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(r.departureAt)}</div>
                </TableCell>
                <TableCell>{tCap(r.capacityType as 'sv')}</TableCell>
                <TableCell>{r.threshold}</TableCell>
                <TableCell>
                  {r.lastCapacity != null ? `${r.lastCapacity}` : '—'}
                  {r.lastNotifiedAt ? (
                    <div className="text-xs text-muted-foreground">
                      {r.lastNotifiedAt.toLocaleString(dateTag)}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {past ? (
                    <Badge variant="secondary">{t('statusPast')}</Badge>
                  ) : r.active ? (
                    <Badge>{t('statusActive')}</Badge>
                  ) : (
                    <Badge variant="outline">{t('statusPaused')}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => onDelete(r.id)}
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
