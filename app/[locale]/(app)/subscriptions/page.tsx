import { desc, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { subscriptions } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { SubscriptionRow } from '@/components/subscription-row'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Link } from '@/i18n/navigation'

export default async function SubscriptionsPage() {
  const session = await requireUser()
  const t = await getTranslations('Subscriptions')
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .orderBy(desc(subscriptions.departureAt))
    .all()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            {t('empty')}{' '}
            <Link className="underline" href="/trips">
              {t('emptyLink')}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columnTrip')}</TableHead>
                <TableHead>{t('columnType')}</TableHead>
                <TableHead>{t('columnThreshold')}</TableHead>
                <TableHead>{t('columnMode')}</TableHead>
                <TableHead>{t('columnStatus')}</TableHead>
                <TableHead className="text-right">{t('columnActions')}</TableHead>
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
