'use client'

import { useForm, useStore } from '@tanstack/react-form'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePollInterval } from '@/actions/admin'
import { pollIntervalNumberSchema, pollIntervalRange } from '@/lib/schemas'

export function PollIntervalForm({ current }: { current: number }) {
  const t = useTranslations('Admin')

  const form = useForm({
    defaultValues: { pollIntervalMs: current },
    onSubmit: async ({ value }) => {
      try {
        await updatePollInterval({ pollIntervalMs: value.pollIntervalMs })
        toast.success(t('saved'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
  })

  const value = useStore(form.store, (s) => s.values.pollIntervalMs)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <div className="flex-1">
        <form.Field
          name="pollIntervalMs"
          validators={{ onChange: pollIntervalNumberSchema }}
        >
          {(field) => (
            <>
              <Label htmlFor={field.name} className="mb-1 block">
                {t('pollLabel')}
              </Label>
              <Input
                id={field.name}
                name={field.name}
                type="number"
                min={pollIntervalRange.min}
                max={pollIntervalRange.max}
                step={1_000}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
              />
              <FieldError field={field} />
            </>
          )}
        </form.Field>
      </div>
      <Button type="submit" disabled={!canSubmit || isSubmitting || value === current}>
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  )
}
