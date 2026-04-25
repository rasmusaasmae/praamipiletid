import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { auth } from '@/lib/auth'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect('/')
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ferry Tickets</CardTitle>
          <CardDescription>Automatically swap tickets when a spot opens up.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSignInButton />
        </CardContent>
      </Card>
    </main>
  )
}
