import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { getSession } from '@/lib/session'

export default async function SignInPage() {
  const session = await getSession()
  if (session) redirect('/')
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ferry Tickets</CardTitle>
          <CardDescription>Get notified when a ferry slot opens up.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSignInButton />
        </CardContent>
      </Card>
    </main>
  )
}
