'use client'

import { useTranslations } from 'next-intl'
import { PraamidAuthCard, type PraamidCredentialMeta } from '@/components/praamid-auth-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type SettingsProps = {
  configured: boolean
  credentialMeta: PraamidCredentialMeta | null
}

export function Settings({ configured, credentialMeta }: SettingsProps) {
  const t = useTranslations('Settings')

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {configured ? (
        <PraamidAuthCard credentialMeta={credentialMeta} />
      ) : (
        <PraamidNotConfigured />
      )}
    </div>
  )
}

function PraamidNotConfigured() {
  const tP = useTranslations('Praamid')
  return (
    <Card id="praamid" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{tP('title')}</CardTitle>
        <CardDescription>{tP('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-destructive">{tP('notConfigured')}</p>
      </CardContent>
    </Card>
  )
}
