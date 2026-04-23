import { eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
import { getMyPraamidAuthState } from '@/lib/queries'
import { SettingsForm } from '@/components/settings-form'
import { PraamidAuthCard } from '@/components/praamid-auth-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SettingsPage() {
  const session = await requireUser()
  const t = await getTranslations('Settings')
  const [me] = await db
    .select({ ntfyTopic: userSettings.ntfyTopic })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1)

  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const status = configured ? await getCredentialStatus(session.user.id) : null
  const authState = configured
    ? await getMyPraamidAuthState()
    : { status: 'unauthenticated' as const, lastError: null }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <PraamidAuthCard
        configured={configured}
        authState={authState}
        credentialMeta={
          status
            ? {
                capturedAt: status.capturedAt,
                expiresAt: status.expiresAt,
                lastVerifiedAt: status.lastVerifiedAt,
                lastError: status.lastError,
              }
            : null
        }
      />

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
          <SettingsForm currentTopic={me?.ntfyTopic ?? ''} />
        </CardContent>
      </Card>
    </div>
  )
}
