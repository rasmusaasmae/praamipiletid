import { eq } from 'drizzle-orm'
import { getFormatter, getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { user } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
import { SettingsForm } from '@/components/settings-form'
import { PraamidBookmarklet } from '@/components/praamid-bookmarklet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireUser()
  const t = await getTranslations('Settings')
  const tP = await getTranslations('Praamid')
  const format = await getFormatter()
  const me = await db
    .select({ ntfyTopic: user.ntfyTopic })
    .from(user)
    .where(eq(user.id, session.user.id))
    .get()
  const ntfyBase = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'

  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const status = configured ? await getCredentialStatus(session.user.id) : null
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  const captureUrl = `${appUrl}/${locale}/praamid/capture`

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
            {t('cardLabel')}{' '}
            <code className="text-foreground">
              {ntfyBase}/{t('topicPlaceholder')}
            </code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm currentTopic={me?.ntfyTopic ?? ''} ntfyBase={ntfyBase} />
        </CardContent>
      </Card>

      <Card id="praamid" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>{tP('title')}</CardTitle>
          <CardDescription>
            {status ? (
              <span className="space-x-3">
                <span>{tP('statusCaptured', { capturedAt: format.relativeTime(status.capturedAt) })}</span>
                <span>·</span>
                <span>{tP('statusExpires', { expiresAt: format.relativeTime(status.expiresAt) })}</span>
                {status.lastVerifiedAt ? (
                  <>
                    <span>·</span>
                    <span>
                      {tP('statusLastVerified', {
                        lastVerifiedAt: format.relativeTime(status.lastVerifiedAt),
                      })}
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              tP('statusMissing')
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{tP('description')}</p>
          {!configured ? (
            <p className="text-sm text-destructive">{tP('notConfigured')}</p>
          ) : (
            <PraamidBookmarklet captureUrl={captureUrl} />
          )}
          {status?.lastError ? (
            <p className="text-sm text-destructive">
              {tP('statusError', { lastError: status.lastError })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
