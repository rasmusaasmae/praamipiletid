import { eq } from 'drizzle-orm'
import { getFormatter, getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { user } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
import { SettingsForm } from '@/components/settings-form'
import { PraamidSigninFlow } from '@/components/praamid-signin-flow'
import { ForgetPraamidButton } from '@/components/forget-praamid-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SettingsPage() {
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

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <Card id="praamid" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CardTitle>{tP('title')}</CardTitle>
              {status ? (
                <Badge variant="success">{tP('statusActiveBadge')}</Badge>
              ) : (
                <Badge variant="outline">{tP('statusMissingBadge')}</Badge>
              )}
            </div>
            <CardDescription>{tP('description')}</CardDescription>
          </div>
          {status ? <ForgetPraamidButton /> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {status ? (
            <p className="text-sm text-muted-foreground">
              <span>{tP('statusCaptured', { capturedAt: format.relativeTime(status.capturedAt) })}</span>
              {' · '}
              <span>{tP('statusExpires', { expiresAt: format.relativeTime(status.expiresAt) })}</span>
              {status.lastVerifiedAt ? (
                <>
                  {' · '}
                  <span>
                    {tP('statusLastVerified', {
                      lastVerifiedAt: format.relativeTime(status.lastVerifiedAt),
                    })}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          {!configured ? (
            <p className="text-sm text-destructive">{tP('notConfigured')}</p>
          ) : (
            <PraamidSigninFlow />
          )}
          {status?.lastError ? (
            <p className="text-sm text-destructive">
              {tP('statusError', { lastError: status.lastError })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('cardTitle')}</CardTitle>
          <CardDescription>
            {t('descriptionBefore')}{' '}
            <a className="underline" href="https://ntfy.sh/app" target="_blank" rel="noreferrer">
              {t('descriptionLink')}
            </a>{' '}
            {t('descriptionAfter')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm currentTopic={me?.ntfyTopic ?? ''} ntfyBase={ntfyBase} />
        </CardContent>
      </Card>
    </div>
  )
}
