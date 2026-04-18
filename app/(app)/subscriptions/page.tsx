import { desc, eq } from 'drizzle-orm'
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

export default async function SubscriptionsPage() {
  const session = await requireUser()
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .orderBy(desc(subscriptions.departureAt))
    .all()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Minu tellimused</h1>
        <p className="text-sm text-muted-foreground">
          Halda oma aktiivseid teavitusi. Mineviku reisid jäävad ajalukku.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-muted-foreground">
            Tellimusi pole. Lisa neid{' '}
            <a className="underline" href="/trips">
              reiside lehelt
            </a>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reis</TableHead>
                <TableHead>Tüüp</TableHead>
                <TableHead>Lävi</TableHead>
                <TableHead>Režiim</TableHead>
                <TableHead>Staatus</TableHead>
                <TableHead className="text-right">Tegevused</TableHead>
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
