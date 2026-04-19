'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
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
import type { Subscription } from '@/db/schema'

const RENOTIFY_CODES = ['once_until_depleted', 'on_change', 'every_cycle'] as const

export function SubscriptionRow({ row }: { row: Subscription }) {
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('Subscriptions')
  const tCap = useTranslations('Capacity')
  const tReno = useTranslations('Subscriptions.renotify')
  const tDir = useTranslations('Directions')
  const locale = useLocale()

  const formatTime = (d: Date) => {
    const tag = locale === 'et' ? 'et-EE' : 'en-GB'
    return d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })
  }

  const submitUpdate = (field: 'threshold' | 'renotifyMode' | 'active', value: string) => {
    const form = new FormData()
    form.set('id', row.id)
    form.set(field, value)
    startTransition(async () => {
      const res = await updateSubscription(form)
      if (res.ok) toast.success(t('saved'))
      else toast.error(res.error)
    })
  }

  const submitDelete = () => {
    const form = new FormData()
    form.set('id', row.id)
    startTransition(async () => {
      const res = await deleteSubscription(form)
      if (res.ok) toast.success(t('deleted'))
      else toast.error(res.error)
    })
  }

  const past = row.departureAt.getTime() < Date.now()

  return (
    <TableRow>
      <TableCell>
        <div className="text-base font-semibold">
          {tDir(row.direction as 'VK')}
        </div>
        <div className="text-lg tabular-nums text-muted-foreground">
          {formatTime(row.departureAt)}
        </div>
      </TableCell>
      <TableCell>{tCap(row.capacityType as 'sv')}</TableCell>
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
            <SelectValue>
              {(v: string) => tReno(v as 'once_until_depleted')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RENOTIFY_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {tReno(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {past ? (
          <Badge variant="secondary">{t('statusPast')}</Badge>
        ) : row.active ? (
          <Badge>{t('statusActive')}</Badge>
        ) : (
          <Badge variant="outline">{t('statusPaused')}</Badge>
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
            {row.active ? t('pause') : t('activate')}
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" disabled={isPending} onClick={submitDelete}>
          {t('delete')}
        </Button>
      </TableCell>
    </TableRow>
  )
}
