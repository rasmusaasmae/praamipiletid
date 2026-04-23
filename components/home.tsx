'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { TripCard } from '@/components/trip-card'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'
import { tripsQueryOptions } from '@/lib/query-options'

export function Home({ pollIntervalMs }: { pollIntervalMs: number }) {
  const t = useTranslations('Home')
  const tT = useTranslations('Trips')

  const { data: cards } = useSuspenseQuery({
    ...tripsQueryOptions,
    refetchInterval: pollIntervalMs,
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{tT('title')}</h2>
          <p className="text-sm text-muted-foreground">{tT('description')}</p>
        </div>
        <Link href="/trips/new" className={buttonVariants()}>
          <Plus className="size-4" />
          {t('addTrip')}
        </Link>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {tT('empty')}{' '}
            <Link className="underline" href="/trips/new">
              {tT('emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <TripCard key={card.trip.id} data={card} pollIntervalMs={pollIntervalMs} />
          ))}
        </div>
      )}
    </div>
  )
}
