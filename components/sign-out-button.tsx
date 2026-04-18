'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { useRouter } from '@/i18n/navigation'

export function SignOutButton() {
  const router = useRouter()
  const t = useTranslations('SignOut')
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await authClient.signOut()
        router.push('/sign-in')
        router.refresh()
      }}
    >
      {t('button')}
    </Button>
  )
}
