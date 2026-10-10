import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api, type PraamidEvent } from '@/lib/api'
import { CAPACITY_LABELS, SHIP_NAMES } from '@/lib/labels'

const CAPACITY_ORDER = ['sv', 'bv', 'pcs', 'mc', 'bc'] as const

type Props = {
  event: PraamidEvent
  ticketId: number
  date: string
  measurementUnit: string
  alreadyAdded: boolean
}

// Departure times as shown at the harbour, whatever the viewer's time zone.
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Tallinn',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EventCard({ event, ticketId, date, measurementUnit, alreadyAdded }: Props) {
  const queryClient = useQueryClient()

  const highlighted = measurementUnit

  const addMutation = useMutation({
    mutationFn: () => api.addOption(ticketId, event.uid, date),
    onSuccess: () => {
      toast.success('Alternative added')
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg font-semibold">{formatTime(event.dtstart)}</span>
            <span className="text-muted-foreground text-sm">→ {formatTime(event.dtend)}</span>
            <Badge variant="outline">{SHIP_NAMES[event.ship.code] ?? event.ship.code}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {CAPACITY_ORDER.map((code) => {
              const v = event.capacities[code]
              if (v == null) return null
              const isWatched = code === highlighted
              return (
                <span
                  key={code}
                  className={
                    isWatched
                      ? 'bg-primary/10 text-primary rounded-md px-2 py-0.5 font-medium'
                      : 'bg-secondary rounded-md px-2 py-0.5'
                  }
                >
                  {CAPACITY_LABELS[code] ?? code}:{' '}
                  <span className="text-foreground font-medium">{v}</span>
                </span>
              )
            })}
          </div>
        </div>
        <Button
          disabled={addMutation.isPending || alreadyAdded}
          onClick={() => addMutation.mutate()}
        >
          {alreadyAdded ? 'Already added' : addMutation.isPending ? 'Saving…' : 'Add'}
        </Button>
      </CardContent>
    </Card>
  )
}
