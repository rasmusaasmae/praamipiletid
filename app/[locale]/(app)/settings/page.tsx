import { eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import { db } from '@/db'
import { praamidAuthState, userSettings } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
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

  // Seed the client with whatever status the server last observed, so the
  // initial render matches reality before the Electric shape hydrates.
  const [stateRow] = configured
    ? await db
        .select({ status: praamidAuthState.status })
        .from(praamidAuthState)
        .where(eq(praamidAuthState.userId, session.user.id))
        .limit(1)
    : []
  const initialStatus =
    (stateRow?.status as
      | 'unauthenticated'
      | 'loading'
      | 'awaiting_confirmation'
      | 'authenticated'
      | undefined) ?? (status ? 'authenticated' : 'unauthenticated')

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <PraamidAuthCard
        configured={configured}
        initialStatus={initialStatus}
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
