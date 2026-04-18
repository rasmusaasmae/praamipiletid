import { eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { user } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { SettingsForm } from '@/components/settings-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SettingsPage() {
  const session = await requireUser()
  const t = await getTranslations('Settings')
  const me = await db
    .select({ ntfyTopic: user.ntfyTopic })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get()
  const ntfyBase = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('descriptionBefore')}{' '}
          <a className="underline" href="https://ntfy.sh/app" target="_blank" rel="noreferrer">
            {t('descriptionLink')}
          </a>{' '}
          {t('descriptionAfter')}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('cardTitle')}</CardTitle>
          <CardDescription>
            {t.rich('cardDescription', {
              url: () => (
                <code className="text-foreground">
                  {ntfyBase}/{t('topicPlaceholder')}
                </code>
              ),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm currentTopic={me?.ntfyTopic ?? ''} ntfyBase={ntfyBase} />
        </CardContent>
      </Card>
    </div>
  )
}
