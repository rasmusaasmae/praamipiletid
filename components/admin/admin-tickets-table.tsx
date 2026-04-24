'use client'

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
import { CAPACITY_LABELS, DIRECTION_LABELS } from '@/lib/praamid'
import {
  adminDashboardQueryOptions,
  type AdminDashboardData,
  type AdminTicketRow,
} from '@/lib/query-options'

const DATE_TAG = 'en-GB'

export function AdminTicketsTable({ rows }: { rows: AdminTicketRow[] }) {
  const deleteMutation = useOptimisticMutation<
    { userId: string; bookingUid: string },
    AdminDashboardData
  >({
    queryKey: adminDashboardQueryOptions.queryKey,
    mutationFn: ({ userId, bookingUid }) => deleteAnyTicket({ userId, bookingUid }),
    optimisticUpdate: (old, { userId, bookingUid }) => ({
      ...old,
      tickets: old.tickets.filter((r) => !(r.userId === userId && r.bookingUid === bookingUid)),
    }),
    successMessage: 'Deleted',
  })

  const formatDateTime = (d: Date) =>
    `${d.toLocaleDateString(DATE_TAG)} ${d.toLocaleTimeString(DATE_TAG, { hour: '2-digit', minute: '2-digit' })}`

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No tickets.</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Ticket</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Alternatives</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const past = r.eventDtstart.getTime() < Date.now()
            return (
              <TableRow key={`${r.userId}|${r.bookingUid}`}>
                <TableCell className="text-xs">{r.userEmail}</TableCell>
                <TableCell>
                  <div className="font-medium">{DIRECTION_LABELS[r.direction] ?? r.direction}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(r.eventDtstart)}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{r.ticketCode}</div>
                </TableCell>
                <TableCell>{CAPACITY_LABELS[r.measurementUnit] ?? r.measurementUnit}</TableCell>
                <TableCell>{r.optionsCount}</TableCell>
                <TableCell>{past ? <Badge variant="secondary">Past</Badge> : null}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      deleteMutation.mutate({ userId: r.userId, bookingUid: r.bookingUid })
                    }
                  >
                    Delete
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
