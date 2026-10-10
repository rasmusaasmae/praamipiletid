'use client'

import { useForm, useStore } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { cancelPraamidLogin, startPraamidLogin } from '@/actions/praamid-auth'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PraamidAuthStatus } from '@/lib/praamidee'
import { cn } from '@/lib/utils'

const STEP_ORDER: PraamidAuthStatus[] = [
  'unauthenticated',
  'loading',
  'awaiting_confirmation',
  'authenticated',
]

const STEP_LABEL: Record<PraamidAuthStatus, string> = {
  unauthenticated: 'Enter ID Code',
  loading: 'Opening praamid.ee',
  awaiting_confirmation: 'Confirm',
  authenticated: 'Authenticated',
}

export function SigninDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  status: PraamidAuthStatus
}) {
  const queryClient = useQueryClient()

  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!open) setSubmitting(false)
  }, [open])
  useEffect(() => {
    if (submitting && status !== 'unauthenticated') setSubmitting(false)
  }, [submitting, status])

  const form = useForm({
    defaultValues: { isikukood: '' },
    onSubmit: async ({ value }) => {
      try {
        await startPraamidLogin({ isikukood: value.isikukood })
        setSubmitting(true)
        void queryClient.invalidateQueries({
          queryKey: ['praamidAuthState'],
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'start_failed'
        toast.error(`Capture failed: ${message}`)
      }
    },
  })
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isFormSubmitting = useStore(form.store, (s) => s.isSubmitting)

  const step: PraamidAuthStatus =
    status === 'authenticated'
      ? 'authenticated'
      : status === 'awaiting_confirmation'
        ? 'awaiting_confirmation'
        : submitting || status === 'loading'
          ? 'loading'
          : 'unauthenticated'

  useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  const onCancel = async () => {
    try {
      await cancelPraamidLogin()
    } catch {
      // ignore
    }
    void queryClient.invalidateQueries({ queryKey: ['praamidAuthState'] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Authenticate with praamid.ee</DialogTitle>
          <DialogDescription>
            We&apos;ll start a Smart-ID session with praamid.ee and store the resulting token so we
            can keep your ticket fresh.
          </DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-[10rem]">
          {step === 'unauthenticated' ? (
            <form
              id="praamid-isikukood-form"
              onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
              }}
              className="flex flex-col gap-3"
            >
              <form.Field
                name="isikukood"
                validators={{
                  onChange: z.string().regex(/^\d{11}$/, 'isikukoodInvalid'),
                }}
              >
                {(field) => (
                  <div>
                    <Label htmlFor={field.name} className="mb-1 block">
                      Estonian ID code
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
                      placeholder="11 digits"
                      autoFocus
                    />
                    <FieldError field={field} />
                    <p className="text-muted-foreground mt-1 text-xs">
                      We use this to start a Smart-ID session with praamid.ee. You&apos;ll need to
                      approve the request on your phone.
                    </p>
                  </div>
                )}
              </form.Field>
            </form>
          ) : step === 'loading' ? (
            <LoadingPanel />
          ) : step === 'awaiting_confirmation' ? (
            <AwaitingPanel />
          ) : step === 'authenticated' ? (
            <SuccessPanel />
          ) : null}
        </div>

        <DialogFooter>
          {step !== 'authenticated' ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {step === 'unauthenticated' ? (
            <Button
              type="submit"
              form="praamid-isikukood-form"
              disabled={!canSubmit || isFormSubmitting || submitting}
            >
              {isFormSubmitting || submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Next
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({ current }: { current: PraamidAuthStatus }) {
  const currentIdx = STEP_ORDER.indexOf(current)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEP_ORDER.map((s, idx) => {
        const active = idx === currentIdx
        const done = idx < currentIdx
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ring-1 ring-inset',
                done && 'bg-primary text-primary-foreground ring-primary',
                active && 'bg-primary/10 text-primary ring-primary',
                !done && !active && 'bg-muted text-muted-foreground ring-border',
              )}
            >
              {idx + 1}
            </span>
            <span
              className={cn(
                'whitespace-nowrap',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {STEP_LABEL[s]}
            </span>
            {idx < STEP_ORDER.length - 1 ? (
              <span className="bg-border h-px w-4 shrink-0" aria-hidden />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
      <p className="font-medium">Opening praamid.ee…</p>
      <p className="text-muted-foreground">
        We&apos;re starting a Smart-ID session — this takes a few seconds.
      </p>
    </div>
  )
}

function AwaitingPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Smartphone className="text-muted-foreground size-6" />
      <p className="text-sm font-medium">Approve on your phone</p>
      <p className="text-muted-foreground text-xs">
        Open the Smart-ID app and approve the request.
      </p>
    </div>
  )
}

function SuccessPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <CheckCircle2 className="text-success size-7" />
      <p className="font-medium">You&apos;re authenticated</p>
      <p className="text-muted-foreground">Session saved. You can close this window.</p>
    </div>
  )
}
