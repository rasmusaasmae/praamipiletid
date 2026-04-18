import { getTranslations, getLocale } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { getSession } from '@/lib/session'
import { redirect } from '@/i18n/navigation'

export default async function SignInPage() {
  const session = await getSession()
  const locale = await getLocale()
  if (session) redirect({ href: '/', locale })
  const t = await getTranslations('SignIn')
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <GoogleSignInButton />
        </CardContent>
      </Card>
    </main>
  )
}
