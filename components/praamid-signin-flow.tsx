'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Loader2, Smartphone } from 'lucide-react'
import { useForm, useStore } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isikukoodSchema } from '@/lib/schemas'

type PollState =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'awaiting_code'; code: string }
  | { kind: 'success'; praamidSub: string; expiresAt: string }
  | { kind: 'error'; error: string }
  | { kind: 'cancelled' }

export function PraamidSigninFlow() {
  const t = useTranslations('Praamid')
  const router = useRouter()
  const [state, setState] = useState<PollState>({ kind: 'none' })
  const pollTimer = useRef<number | null>(null)

  const form = useForm({
    defaultValues: { isikukood: '' },
    onSubmit: async ({ value }) => {
      setState({ kind: 'pending' })
      try {
        const res = await fetch('/api/praamid-login/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isikukood: value.isikukood }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'start_failed')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'start_failed'
        toast.error(t('captureFailed', { error: message }))
        setState({ kind: 'error', error: message })
      }
    },
  })

  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting)

  const active = state.kind === 'pending' || state.kind === 'awaiting_code'

  useEffect(() => {
    if (!active) {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      return
    }
    const tick = async () => {
      try {
        const res = await fetch('/api/praamid-login/poll', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { state: PollState }
        setState(data.state)
        if (data.state.kind === 'success') {
          toast.success(t('captured'))
          router.refresh()
        } else if (data.state.kind === 'error') {
          toast.error(t('captureFailed', { error: data.state.error }))
        }
      } catch {
        // transient — keep polling
      }
    }
    void tick()
    pollTimer.current = window.setInterval(tick, 1000)
    return () => {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [active, router, t])

  const onCancel = async () => {
    try {
      await fetch('/api/praamid-login/cancel', { method: 'POST' })
    } catch {
      // ignore
    }
    setState({ kind: 'none' })
    form.reset()
  }

  if (state.kind === 'pending') {
    return (
      <div className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>{t('statusStarting')}</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="self-start">
          {t('cancel')}
        </Button>
      </div>
    )
  }

  if (state.kind === 'awaiting_code') {
    return (
      <div className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{t('verifyCodeTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('verifyCodeHint')}</p>
          </div>
        </div>
        {state.code ? (
          <div className="self-center font-mono text-4xl font-semibold tracking-[0.3em]">
            {state.code}
          </div>
        ) : (
          <div className="flex items-center gap-2 self-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{t('verifyCodeWaiting')}</span>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="self-start">
          {t('cancel')}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-3"
    >
      <form.Field
        name="isikukood"
        validators={{ onChange: isikukoodSchema }}
      >
        {(field) => (
          <div>
            <Label htmlFor={field.name} className="mb-1 block">
              {t('isikukoodLabel')}
            </Label>
            <Input
              id={field.name}
              name={field.name}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) =>
                field.handleChange(e.target.value.replace(/\D/g, '').slice(0, 11))
              }
              pattern="\d{11}"
              maxLength={11}
              required
              placeholder={t('isikukoodPlaceholder')}
              className="max-w-xs"
            />
            <FieldError field={field} />
            <p className="mt-1 text-xs text-muted-foreground">{t('isikukoodHint')}</p>
          </div>
        )}
      </form.Field>
      <Button type="submit" disabled={!canSubmit || isSubmitting} className="self-start">
        {isSubmitting ? t('statusStarting') : t('signIn')}
      </Button>
    </form>
  )
}
