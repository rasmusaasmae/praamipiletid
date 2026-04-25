'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function GoogleSignInButton() {
  const signIn = useMutation({
    mutationFn: () => authClient.signIn.social({ provider: 'google', callbackURL: '/' }),
    onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
  })

  return (
    <Button className="w-full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
      {signIn.isPending ? 'Redirecting…' : 'Sign in with Google'}
    </Button>
  )
}
