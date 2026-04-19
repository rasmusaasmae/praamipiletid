'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
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
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import {
  attachTicket,
  listAttachableTickets,
  type AttachableTicket,
} from '@/actions/tickets'
import { cn } from '@/lib/utils'

type Props = {
  tripId: string
  disabled?: boolean
}

export function AttachTicketDialog({ tripId, disabled }: Props) {
  const t = useTranslations('Ticket')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState<AttachableTicket[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [isAttaching, startAttach] = useTransition()

  const dateTag = locale === 'et' ? 'et-EE' : 'en-GB'
  const formatTicket = (raw: AttachableTicket) => {
    const d = new Date(raw.eventDtstart)
    if (Number.isNaN(d.getTime())) return raw.ticketNumber
    const date = d.toLocaleDateString(dateTag, { day: 'numeric', month: 'short' })
    const time = d.toLocaleTimeString(dateTag, { hour: '2-digit', minute: '2-digit' })
    return `${date} · ${time}`
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setListError(null)
    setSelected(null)
    void (async () => {
      const res = await listAttachableTickets(tripId)
      if (cancelled) return
      if (res.ok) {
        setTickets(res.tickets)
      } else {
        setTickets([])
        setListError(res.error)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, tripId])

  const onConfirm = () => {
    if (!selected) return
    startAttach(async () => {
      const form = new FormData()
      form.set('tripId', tripId)
      form.set('ticketCode', selected)
      const res = await attachTicket(form)
      if (res.ok) {
        toast.success(t('attached'))
        setOpen(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        {t('attach')}
      </Button>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('attachTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('attachDescription')}</AlertDialogDescription>
        </AlertDialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : listError ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">{listError}</p>
            <Link
              href="/settings/praamid"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              {t('goToSettings')}
            </Link>
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('attachEmpty')}</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {tickets.map((ticket) => {
              const isSelected = selected === ticket.ticketCode
              return (
                <li key={ticket.ticketCode}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      isSelected && 'border-primary bg-accent',
                    )}
                    onClick={() => setSelected(ticket.ticketCode)}
                    aria-pressed={isSelected}
                  >
                    <TicketIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{formatTicket(ticket)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ticket.ticketNumber}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isAttaching}>{t('attachCancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isAttaching || !selected}
          >
            {isAttaching ? t('attaching') : t('attachConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
