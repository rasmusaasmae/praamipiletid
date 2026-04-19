import { asc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { db } from '@/db'
import { journeyOptions, journeys, tickets, user } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { JourneyCard, type JourneyCardData } from '@/components/journey-card'
import { TopicCopyButton } from '@/components/topic-copy-button'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export default async function HomePage() {
  const session = await requireUser()
  const t = await getTranslations('Home')
  const tJ = await getTranslations('Journeys')

  const [me, journeyRows, optionRows, ticketRows] = await Promise.all([
    db
      .select({ ntfyTopic: user.ntfyTopic })
      .from(user)
      .where(eq(user.id, session.user.id))
      .get(),
    db
      .select({
        id: journeys.id,
        direction: journeys.direction,
        measurementUnit: journeys.measurementUnit,
        threshold: journeys.threshold,
        active: journeys.active,
        notify: journeys.notify,
        edit: journeys.edit,
      })
      .from(journeys)
      .where(eq(journeys.userId, session.user.id))
      .all(),
    db
      .select({
        id: journeyOptions.id,
        journeyId: journeyOptions.journeyId,
        priority: journeyOptions.priority,
        active: journeyOptions.active,
        eventUid: journeyOptions.eventUid,
        eventDate: journeyOptions.eventDate,
        eventDtstart: journeyOptions.eventDtstart,
        lastCapacity: journeyOptions.lastCapacity,
        lastCapacityState: journeyOptions.lastCapacityState,
      })
      .from(journeyOptions)
      .innerJoin(journeys, eq(journeys.id, journeyOptions.journeyId))
      .where(eq(journeys.userId, session.user.id))
      .orderBy(asc(journeyOptions.priority))
      .all(),
    db
      .select()
      .from(tickets)
      .innerJoin(journeys, eq(journeys.id, tickets.journeyId))
      .where(eq(journeys.userId, session.user.id))
      .all(),
  ])

  const ntfyBase = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
  const topic = me?.ntfyTopic ?? ''
  const fullUrl = topic ? `${ntfyBase}/${topic}` : null

  const optionsByJourney = new Map<string, (typeof optionRows)[number][]>()
  for (const o of optionRows) {
    const list = optionsByJourney.get(o.journeyId) ?? []
    list.push(o)
    optionsByJourney.set(o.journeyId, list)
  }
  const ticketByJourney = new Map(ticketRows.map((r) => [r.tickets.journeyId, r.tickets]))

  const cards: JourneyCardData[] = journeyRows
    .map((j) => ({
      journey: j,
      options: optionsByJourney.get(j.id) ?? [],
      ticket: ticketByJourney.get(j.id) ?? null,
    }))
    .sort((a, b) => {
      const aNext = a.options[0]?.eventDtstart.getTime() ?? Infinity
      const bNext = b.options[0]?.eventDtstart.getTime() ?? Infinity
      return aNext - bNext
    })

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('topicTitle')}</CardTitle>
          <CardDescription>{t('topicDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {topic ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {topic}
                </code>
                <TopicCopyButton value={topic} />
              </div>
              <p className="text-xs text-muted-foreground">{fullUrl}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('topicMissing')}{' '}
              <Link className="underline" href="/settings">
                {t('topicMissingLink')}
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{tJ('title')}</h2>
          <p className="text-sm text-muted-foreground">{tJ('description')}</p>
        </div>
        <Link href="/trips" className={buttonVariants()}>
          <Plus className="size-4" />
          {t('addJourney')}
        </Link>
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {tJ('empty')}{' '}
            <Link className="underline" href="/trips">
              {tJ('emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <JourneyCard key={card.journey.id} data={card} />
          ))}
        </div>
      )}
    </div>
  )
}
