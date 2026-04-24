'use client'

import { useParams } from 'next/navigation'
import { useTransition } from 'react'
import { MoonIcon, SunIcon, MonitorIcon, LogOutIcon, UserIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useLocale, useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  et: 'Eesti',
  en: 'English',
}

type Props = {
  user: { email: string; image: string | null }
}

export function AvatarMenu({ user }: Props) {
  const { theme, setTheme } = useTheme()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const [, startTransition] = useTransition()
  const tTheme = useTranslations('ThemeToggle')
  const tLocale = useTranslations('LocaleToggle')
  const tSignOut = useTranslations('SignOut')

  const setLocale = (next: string) => {
    if (next === locale) return
    startTransition(() => {
      router.replace(
        // @ts-expect-error — params are compatible with the current route's typed params
        { pathname, params },
        { locale: next as (typeof routing.locales)[number] },
      )
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-muted-foreground outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={user.email}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <UserIcon className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="truncate px-1.5 py-1 text-sm font-medium">{user.email}</div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{tTheme('label')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <SunIcon />
              {tTheme('light')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <MoonIcon />
              {tTheme('dark')}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <MonitorIcon />
              {tTheme('system')}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{tLocale('label')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
            {routing.locales.map((l) => (
              <DropdownMenuRadioItem key={l} value={l}>
                {LOCALE_LABELS[l]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await authClient.signOut()
            router.push('/sign-in')
            router.refresh()
          }}
        >
          <LogOutIcon />
          {tSignOut('button')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
