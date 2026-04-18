import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { getSession } from '@/lib/session'

export default async function SignInPage() {
  const session = await getSession()
  if (session) redirect('/trips')
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Praamipiletid</CardTitle>
          <CardDescription>Telli teade, kui laevale vabaneb koht.</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSignInButton />
        </CardContent>
      </Card>
    </main>
  )
}
