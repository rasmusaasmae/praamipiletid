'use client'

import { toast } from 'sonner'
import { useForm, useStore } from '@tanstack/react-form'
import { z } from 'zod'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { createTrip } from '@/actions/trips'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { directionSchema } from '@/lib/schemas'

type Option = { code: string; label: string }

type Props = {
  directions: Option[]
  units: Option[]
}

const unitSchema = z.string().min(1)

export function NewTripForm({ directions, units }: Props) {
  const router = useRouter()
  const t = useTranslations('NewTrip')

  const form = useForm({
    defaultValues: {
      direction: (directions[0]?.code ?? 'HR') as z.infer<typeof directionSchema>,
      measurementUnit: units[0]?.code ?? 'sv',
      notify: true,
      edit: false,
    },
    onSubmit: async ({ value }) => {
      try {
        const { tripId } = await createTrip(value)
        toast.success(t('created'))
        router.push(`/trips/${tripId}/options`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
  })

  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <form.Field
        name="direction"
        validators={{ onChange: directionSchema }}
      >
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t('direction')}</Label>
            <Select
              value={field.state.value}
              onValueChange={(v) => v && field.handleChange(v as 'VK' | 'KV' | 'RH' | 'HR')}
            >
              <SelectTrigger id={field.name} className="w-full">
                <SelectValue>
                  {(v: string) => directions.find((d) => d.code === v)?.label ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {directions.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError field={field} />
          </div>
        )}
      </form.Field>

      <form.Field
        name="measurementUnit"
        validators={{ onChange: unitSchema }}
      >
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor={field.name}>{t('measurementUnit')}</Label>
            <Select value={field.state.value} onValueChange={(v) => v && field.handleChange(v)}>
              <SelectTrigger id={field.name} className="w-full">
                <SelectValue>
                  {(v: string) => units.find((u) => u.code === v)?.label ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError field={field} />
          </div>
        )}
      </form.Field>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <form.Field name="notify">
          {(field) => (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{t('notifyLabel')}</span>
                <span className="text-xs text-muted-foreground">{t('notifyHelp')}</span>
              </span>
            </label>
          )}
        </form.Field>

        <form.Field name="edit">
          {(field) => (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{t('editLabel')}</span>
                <span className="text-xs text-muted-foreground">{t('editHelp')}</span>
              </span>
            </label>
          )}
        </form.Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push('/')}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? t('creating') : t('submit')}
        </Button>
      </div>
    </form>
  )
}
