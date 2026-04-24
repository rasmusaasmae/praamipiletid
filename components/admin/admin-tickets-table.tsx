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
import { deleteAnyTicket } from '@/actions/admin'
import { useOptimisticMutation } from '@/lib/mutations'
import {
  adminDashboardQueryOptions,
  type AdminDashboardData,
  type AdminTicketRow,
} from '@/lib/query-options'

export function AdminTicketsTable({ rows }: { rows: AdminTicketRow[] }) {
  const t = useTranslations('Admin')
  const tCap = useTranslations('Capacity')
  const tDir = useTranslations('Directions')
  const locale = useLocale()

  const deleteMutation = useOptimisticMutation<
    { userId: string; bookingUid: string },
    AdminDashboardData
  >({
    queryKey: adminDashboardQueryOptions.queryKey,
    mutationFn: ({ userId, bookingUid }) => deleteAnyTicket({ userId, bookingUid }),
    optimisticUpdate: (old, { userId, bookingUid }) => ({
      ...old,
      tickets: old.tickets.filter(
        (r) => !(r.userId === userId && r.bookingUid === bookingUid),
      ),
    }),
    successMessage: t('deleted'),
  })

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatDateTime = (d: Date) =>
    `${d.toLocaleDateString(dateTag)} ${d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })}`

  if (rows.length === 0) {
    return <p className="text-muted-foreground">{t('ticketsEmpty')}</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('columnUser')}</TableHead>
            <TableHead>{t('columnTicket')}</TableHead>
            <TableHead>{t('columnType')}</TableHead>
            <TableHead>{t('columnOptions')}</TableHead>
            <TableHead>{t('columnStatus')}</TableHead>
            <TableHead className="text-right">{t('columnActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const past = r.eventDtstart.getTime() < Date.now()
            return (
              <TableRow key={`${r.userId}|${r.bookingUid}`}>
                <TableCell className="text-xs">{r.userEmail}</TableCell>
                <TableCell>
                  <div className="font-medium">{tDir(r.direction as 'VK')}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(r.eventDtstart)}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{r.ticketCode}</div>
                </TableCell>
                <TableCell>{tCap(r.measurementUnit as 'sv')}</TableCell>
                <TableCell>{r.optionsCount}</TableCell>
                <TableCell>
                  {past ? <Badge variant="secondary">{t('statusPast')}</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      deleteMutation.mutate({ userId: r.userId, bookingUid: r.bookingUid })
                    }
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
