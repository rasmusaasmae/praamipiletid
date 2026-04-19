'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Ticket as TicketIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AttachTicketDialog } from '@/components/attach-ticket-dialog'
import { detachTicket } from '@/actions/tickets'
import type { Ticket } from '@/db/schema'

type Props = {
  tripId: string
  ticket: Ticket | null
}

export function TicketSlot({ tripId, ticket }: Props) {
  const t = useTranslations('Ticket')
  const [isPending, startTransition] = useTransition()

  const onDetach = () => {
    startTransition(async () => {
      const form = new FormData()
      form.set('tripId', tripId)
      const res = await detachTicket(form)
      if (res.ok) toast.success(t('detached'))
      else toast.error(res.error)
    })
  }

  if (ticket) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <TicketIcon className="size-4 text-muted-foreground" />
          <span className="font-mono">{ticket.ticketNumber}</span>
          <span className="text-muted-foreground">{ticket.ticketDate}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button size="sm" variant="outline" disabled={isPending} />}
          >
            {isPending ? t('detaching') : t('detach')}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('detach')}</AlertDialogTitle>
              <AlertDialogDescription>{t('detachConfirm')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('attachCancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDetach}>
                {t('detach')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <TicketIcon className="size-4" />
        <span>{t('empty')}</span>
      </div>
      <AttachTicketDialog tripId={tripId} />
    </div>
  )
}
