import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { userSettings } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { getCredentialStatus } from '@/lib/praamid-credentials'
import { getQueryClient } from '@/lib/get-query-client'
import { praamidAuthStateQueryOptions } from '@/lib/query-options'
import { Settings } from '@/components/settings'

export default async function SettingsPage() {
  const session = await requireUser()
  const [me] = await db
    .select({ ntfyTopic: userSettings.ntfyTopic })
    .from(userSettings)
    .where(eq(userSettings.userId, session.user.id))
    .limit(1)

  const configured = Boolean(process.env.PRAAMID_CRED_KEY)
  const status = configured ? await getCredentialStatus(session.user.id) : null

  const queryClient = getQueryClient()
  if (configured) {
    void queryClient.prefetchQuery(praamidAuthStateQueryOptions)
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Settings
        configured={configured}
        currentTopic={me?.ntfyTopic ?? ''}
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
    </HydrationBoundary>
  )
}
