'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LABELS: Record<(typeof routing.locales)[number], string> = {
  et: 'ET',
  en: 'EN',
}

export function LocaleToggle() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const t = useTranslations('LocaleToggle')
  const [isPending, startTransition] = useTransition()

  const setLocale = (next: (typeof routing.locales)[number]) => {
    startTransition(() => {
      router.replace(
        // @ts-expect-error — params are compatible with the current route's typed params
        { pathname, params },
        { locale: next },
      )
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t('label')} disabled={isPending} />
        }
      >
        {LABELS[locale as keyof typeof LABELS] ?? locale.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLocale(l)} disabled={l === locale}>
            {LABELS[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
