import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'

export function SignInPage() {
  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.social({ provider: 'pocket-id', callbackURL: '/' })
      if (error) throw new Error(error.message ?? 'Sign-in failed')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ferry tickets</CardTitle>
          <CardDescription>Automatically swap tickets when a spot opens up.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? 'Redirecting…' : 'Sign in with Pocket ID'}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
