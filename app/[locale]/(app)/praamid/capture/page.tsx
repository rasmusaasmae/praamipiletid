import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/session'
import { PraamidCaptureClient } from '@/components/praamid-capture-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function PraamidCapturePage() {
  await requireUser()
  const t = await getTranslations('Praamid')

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('captureTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PraamidCaptureClient />
        </CardContent>
      </Card>
    </div>
  )
}
