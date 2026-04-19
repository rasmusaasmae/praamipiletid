import { getTranslations } from 'next-intl/server'
import { requireUser } from '@/lib/session'
import { NewTripForm } from '@/components/new-trip-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function NewTripPage() {
  await requireUser()
  const t = await getTranslations('NewTrip')
  const tDir = await getTranslations('Directions')
  const tCap = await getTranslations('Capacity')

  const directions = (['VK', 'KV', 'RH', 'HR'] as const).map((code) => ({
    code,
    label: tDir(code),
  }))
  const units = (['sv', 'bv', 'pcs', 'mc', 'bc'] as const).map((code) => ({
    code,
    label: tCap(code),
  }))

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <NewTripForm directions={directions} units={units} />
        </CardContent>
      </Card>
    </div>
  )
}
