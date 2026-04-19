import { getFormatter, getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
import { PraamidBookmarklet } from '@/components/praamid-bookmarklet'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function PraamidSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireUser()
  const t = await getTranslations('Praamid')
  const format = await getFormatter()

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
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('howToTitle')}</CardTitle>
          <CardDescription>
            {status ? (
              <span className="space-x-3">
                <span>{t('statusCaptured', { capturedAt: format.relativeTime(status.capturedAt) })}</span>
                <span>·</span>
                <span>{t('statusExpires', { expiresAt: format.relativeTime(status.expiresAt) })}</span>
                {status.lastVerifiedAt ? (
                  <>
                    <span>·</span>
                    <span>
                      {t('statusLastVerified', {
                        lastVerifiedAt: format.relativeTime(status.lastVerifiedAt),
                      })}
                    </span>
                  </>
                ) : null}
              </span>
            ) : (
              t('statusMissing')
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!configured ? (
            <p className="text-sm text-destructive">{t('notConfigured')}</p>
          ) : (
            <PraamidBookmarklet captureUrl={captureUrl} />
          )}
          {status?.lastError ? (
            <p className="text-sm text-destructive">
              {t('statusError', { lastError: status.lastError })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
