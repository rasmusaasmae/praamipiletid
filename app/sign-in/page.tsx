import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function SignInPage() {
  const session = await getSession()
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
