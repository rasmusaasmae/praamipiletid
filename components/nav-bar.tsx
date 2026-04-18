import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { LocaleToggle } from '@/components/locale-toggle'

type Props = {
  user: { name: string; email: string; role: string }
}

export async function NavBar({ user }: Props) {
  const t = await getTranslations('NavBar')
  const isAdmin = user.role === 'admin'
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/trips" className="font-semibold">
            {t('brand')}
          </Link>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/trips" className="hover:text-foreground">
              {t('trips')}
            </Link>
            <Link href="/subscriptions" className="hover:text-foreground">
              {t('subscriptions')}
            </Link>
            <Link href="/settings" className="hover:text-foreground">
              {t('settings')}
            </Link>
            {isAdmin ? (
              <Link href="/admin" className="hover:text-foreground">
                {t('admin')}
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          <LocaleToggle />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}
