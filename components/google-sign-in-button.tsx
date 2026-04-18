'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false)
  const t = useTranslations('SignIn')
  const locale = useLocale()
  return (
    <Button
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        await authClient.signIn.social({
          provider: 'google',
          callbackURL: `/${locale}/trips`,
        })
      }}
    >
      {loading ? t('redirecting') : t('google')}
    </Button>
  )
}
