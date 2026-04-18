'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false)
  return (
    <Button
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        await authClient.signIn.social({
          provider: 'google',
          callbackURL: '/trips',
        })
      }}
    >
      {loading ? 'Suunan…' : 'Logi sisse Google kontoga'}
    </Button>
  )
}
