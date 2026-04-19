import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { AvatarMenu } from '@/components/avatar-menu'

type Props = {
  user: { name: string; email: string; image: string | null; role: string }
}

export async function NavBar({ user }: Props) {
  const t = await getTranslations('NavBar')
  const isAdmin = user.role === 'admin'
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/" className="font-semibold">
            {t('brand')}
          </Link>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground sm:gap-3">
            <Link href="/" className="hover:text-foreground">
              {t('home')}
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
        <AvatarMenu user={{ email: user.email, image: user.image }} />
      </div>
    </header>
  )
}
