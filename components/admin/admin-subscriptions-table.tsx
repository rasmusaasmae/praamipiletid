'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
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
import { CAPACITY_LABELS } from '@/lib/praamid'

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

function formatDateTime(d: Date) {
  return `${d.toLocaleDateString('et-EE')} ${d.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })}`
}

export function AdminSubscriptionsTable({ rows }: { rows: Row[] }) {
  const [isPending, startTransition] = useTransition()

  const onDelete = (id: string) => {
    const form = new FormData()
    form.set('id', id)
    startTransition(async () => {
      const res = await deleteAnySubscription(form)
      if (res.ok) toast.success('Kustutatud')
      else toast.error(res.error)
    })
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground">Tellimusi pole.</p>
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kasutaja</TableHead>
            <TableHead>Reis</TableHead>
            <TableHead>Tüüp</TableHead>
            <TableHead>Lävi</TableHead>
            <TableHead>Viimati</TableHead>
            <TableHead>Staatus</TableHead>
            <TableHead className="text-right">Tegevused</TableHead>
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
                <TableCell>{CAPACITY_LABELS[r.capacityType]?.et ?? r.capacityType}</TableCell>
                <TableCell>{r.threshold}</TableCell>
                <TableCell>
                  {r.lastCapacity != null ? `${r.lastCapacity}` : '—'}
                  {r.lastNotifiedAt ? (
                    <div className="text-xs text-muted-foreground">
                      {r.lastNotifiedAt.toLocaleString('et-EE')}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  {past ? (
                    <Badge variant="secondary">Möödunud</Badge>
                  ) : r.active ? (
                    <Badge>Aktiivne</Badge>
                  ) : (
                    <Badge variant="outline">Peatatud</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => onDelete(r.id)}
                  >
                    Kustuta
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
