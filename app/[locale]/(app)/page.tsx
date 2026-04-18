import { desc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { db } from '@/db'
import { subscriptions, user } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { SubscriptionRow } from '@/components/subscription-row'
import { TopicCopyButton } from '@/components/topic-copy-button'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export default async function HomePage() {
  const session = await requireUser()
  const t = await getTranslations('Home')
  const tSub = await getTranslations('Subscriptions')

  const [me, rows] = await Promise.all([
    db
      .select({ ntfyTopic: user.ntfyTopic })
      .from(user)
      .where(eq(user.id, session.user.id))
      .get(),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .orderBy(desc(subscriptions.departureAt))
      .all(),
  ])

  const ntfyBase = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'
  const topic = me?.ntfyTopic ?? ''
  const fullUrl = topic ? `${ntfyBase}/${topic}` : null

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
          <h2 className="text-2xl font-semibold">{tSub('title')}</h2>
          <p className="text-sm text-muted-foreground">{tSub('description')}</p>
        </div>
        <Link href="/trips" className={buttonVariants()}>
          <Plus className="size-4" />
          {t('addSubscription')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {tSub('empty')}{' '}
            <Link className="underline" href="/trips">
              {tSub('emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tSub('columnTrip')}</TableHead>
                <TableHead>{tSub('columnType')}</TableHead>
                <TableHead>{tSub('columnThreshold')}</TableHead>
                <TableHead>{tSub('columnMode')}</TableHead>
                <TableHead>{tSub('columnStatus')}</TableHead>
                <TableHead className="text-right">{tSub('columnActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <SubscriptionRow key={r.id} row={r} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
