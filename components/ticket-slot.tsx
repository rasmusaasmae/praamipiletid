import { useTranslations } from 'next-intl'
import { Ticket as TicketIcon } from 'lucide-react'
import type { Ticket } from '@/db/schema'
import { Button } from '@/components/ui/button'

type Props = {
  ticket: Ticket | null
}

export function TicketSlot({ ticket }: Props) {
  const t = useTranslations('Ticket')

  if (ticket) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <TicketIcon className="size-4 text-muted-foreground" />
          <span className="font-mono">{ticket.ticketCode}</span>
          <span className="text-muted-foreground">{ticket.ticketDate}</span>
        </div>
        <Button size="sm" variant="outline" disabled>
          {t('detach')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <TicketIcon className="size-4" />
        <span>{t('empty')}</span>
      </div>
      <Button size="sm" variant="outline" disabled>
        {t('attachSoon')}
      </Button>
    </div>
  )
}
