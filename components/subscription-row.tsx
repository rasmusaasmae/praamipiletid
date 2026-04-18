'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { deleteSubscription, updateSubscription } from '@/actions/subscriptions'
import { CAPACITY_LABELS } from '@/lib/praamid'
import type { Subscription } from '@/db/schema'

const RENOTIFY_LABELS: Record<string, string> = {
  once_until_depleted: 'Üks kord kuni otsa saab',
  on_change: 'Iga muutus',
  every_cycle: 'Iga päring',
}

function formatDateTime(d: Date) {
  const day = d.toLocaleDateString('et-EE')
  const time = d.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' })
  return `${day} ${time}`
}

export function SubscriptionRow({ row }: { row: Subscription }) {
  const [isPending, startTransition] = useTransition()

  const submitUpdate = (field: 'threshold' | 'renotifyMode' | 'active', value: string) => {
    const form = new FormData()
    form.set('id', row.id)
    form.set(field, value)
    startTransition(async () => {
      const res = await updateSubscription(form)
      if (res.ok) toast.success('Salvestatud')
      else toast.error(res.error)
    })
  }

  const submitDelete = () => {
    const form = new FormData()
    form.set('id', row.id)
    startTransition(async () => {
      const res = await deleteSubscription(form)
      if (res.ok) toast.success('Kustutatud')
      else toast.error(res.error)
    })
  }

  const past = row.departureAt.getTime() < Date.now()

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.direction}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(row.departureAt)}</div>
      </TableCell>
      <TableCell>{CAPACITY_LABELS[row.capacityType]?.et ?? row.capacityType}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          defaultValue={row.threshold}
          className="w-20"
          disabled={isPending || past}
          onBlur={(e) => {
            if (Number(e.target.value) !== row.threshold) {
              submitUpdate('threshold', e.target.value)
            }
          }}
        />
      </TableCell>
      <TableCell>
        <Select
          value={row.renotifyMode}
          onValueChange={(v) => v && submitUpdate('renotifyMode', v)}
          disabled={isPending || past}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RENOTIFY_LABELS).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {past ? (
          <Badge variant="secondary">Möödunud</Badge>
        ) : row.active ? (
          <Badge>Aktiivne</Badge>
        ) : (
          <Badge variant="outline">Peatatud</Badge>
        )}
      </TableCell>
      <TableCell className="space-x-1 text-right">
        {!past ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => submitUpdate('active', row.active ? '' : 'true')}
          >
            {row.active ? 'Peata' : 'Aktiveeri'}
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" disabled={isPending} onClick={submitDelete}>
          Kustuta
        </Button>
      </TableCell>
    </TableRow>
  )
}
