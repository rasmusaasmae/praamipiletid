'use client'

import { useForm, useStore } from '@tanstack/react-form'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateNtfyTopic } from '@/actions/user-settings'
import { ntfyTopicSchema } from '@/lib/schemas'

export function SettingsForm({ currentTopic }: { currentTopic: string }) {
  const t = useTranslations('Settings')

  const form = useForm({
    defaultValues: { ntfyTopic: currentTopic },
    onSubmit: async ({ value }) => {
      try {
        await updateNtfyTopic({ ntfyTopic: value.ntfyTopic })
        toast.success(t('saved'))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
  })

  const topic = useStore(form.store, (s) => s.values.ntfyTopic)
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <div>
        <form.Field
          name="ntfyTopic"
          validators={{ onChange: ntfyTopicSchema }}
        >
          {(field) => (
            <>
              <Label htmlFor={field.name} className="mb-1 block">
                {t('topicLabel')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  pattern="^[A-Za-z0-9_\-]+$"
                  minLength={4}
                  maxLength={64}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!field.state.value}
                  onClick={async () => {
                    await navigator.clipboard.writeText(field.state.value)
                    toast.success(t('copied'))
                  }}
                  aria-label={t('copy')}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <FieldError field={field} />
            </>
          )}
        </form.Field>
      </div>
      <Button
        type="submit"
        disabled={!canSubmit || isSubmitting || topic === currentTopic}
        className="self-start"
      >
        {isSubmitting ? t('saving') : t('save')}
      </Button>
    </form>
  )
}
