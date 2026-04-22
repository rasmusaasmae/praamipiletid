'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from '@tanstack/react-db'
import { useForm, useStore } from '@tanstack/react-form'
import { toast } from 'sonner'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { CheckCircle2, Loader2, Smartphone, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { forgetPraamidCredential } from '@/actions/praamid'
import { praamidAuthStateCollection, type PraamidAuthStateRow } from '@/lib/collections'
import { isikukoodSchema } from '@/lib/schemas'
import { cn } from '@/lib/utils'

export type PraamidCredentialMeta = {
  capturedAt: Date
  expiresAt: Date
  lastVerifiedAt: Date | null
  lastError: string | null
}

export type PraamidAuthCardProps = {
  configured: boolean
  credentialMeta: PraamidCredentialMeta | null
  initialStatus: 'unauthenticated' | 'loading' | 'awaiting_confirmation' | 'authenticated'
}

type Status = PraamidAuthStateRow['status']

const STEP_ORDER: Status[] = [
  'unauthenticated',
  'loading',
  'awaiting_confirmation',
  'authenticated',
]

export function PraamidAuthCard({
  configured,
  credentialMeta,
  initialStatus,
}: PraamidAuthCardProps) {
  const tP = useTranslations('Praamid')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const router = useRouter()

  const { data: rows } = useLiveQuery((q) => q.from({ s: praamidAuthStateCollection }))
  // Per-user PK means at most one row — but on first render before the
  // shape has synced we show whatever the server already rendered.
  const live = rows[0] as PraamidAuthStateRow | undefined
  const status: Status = live?.status ?? initialStatus

  const [dialogOpen, setDialogOpen] = useState(false)

  // When the row transitions into 'authenticated': close the dialog on a
  // short delay (so the user sees the success step) and ask the RSC to
  // re-fetch credential metadata. prevStatus must be updated *before* any
  // early return to avoid re-entering this branch on subsequent renders.
  const prevStatus = useRef<Status>(status)
  useEffect(() => {
    const justAuthed = prevStatus.current !== 'authenticated' && status === 'authenticated'
    prevStatus.current = status
    if (!justAuthed) return
    router.refresh()
    if (!dialogOpen) return
    const t = setTimeout(() => setDialogOpen(false), 1200)
    return () => clearTimeout(t)
  }, [status, dialogOpen, router])

  const isAuthenticated = status === 'authenticated'
  const isActive = status === 'loading' || status === 'awaiting_confirmation'

  return (
    <Card id="praamid" className="scroll-mt-24">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>{tP('title')}</CardTitle>
            <StatusBadge status={status} />
          </div>
          <CardDescription>{tP('description')}</CardDescription>
        </div>
        {isAuthenticated ? <ForgetButton /> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {credentialMeta && isAuthenticated ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="w-fit text-sm text-muted-foreground">
                  {tP('statusExpires', {
                    expiresAt: format.relativeTime(credentialMeta.expiresAt, now),
                  })}
                </p>
              }
            />
            <TooltipContent>
              {format.dateTime(credentialMeta.expiresAt, {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {!configured ? (
          <p className="text-sm text-destructive">{tP('notConfigured')}</p>
        ) : isAuthenticated ? null : (
          <Button type="button" onClick={() => setDialogOpen(true)} className="self-start">
            {isActive ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {tP(`authStatus.${status}`)}
              </>
            ) : (
              tP('signIn')
            )}
          </Button>
        )}
      </CardContent>

      <SigninDialog open={dialogOpen} onOpenChange={setDialogOpen} status={status} />
    </Card>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const tP = useTranslations('Praamid')
  const variant =
    status === 'authenticated'
      ? 'success'
      : status === 'loading' || status === 'awaiting_confirmation'
        ? 'secondary'
        : 'outline'
  return <Badge variant={variant}>{tP(`authStatus.${status}`)}</Badge>
}

function ForgetButton() {
  const t = useTranslations('Praamid')
  const [isForgetting, startForget] = useTransition()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isForgetting}
            aria-label={t('forget')}
            onClick={() =>
              startForget(async () => {
                if (!confirm(t('forgetConfirm'))) return
                const res = await forgetPraamidCredential()
                if (res.ok) toast.success(t('forgotten'))
                else toast.error(res.error)
              })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <TooltipContent>{t('forget')}</TooltipContent>
    </Tooltip>
  )
}

function SigninDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  status: Status
}) {
  const tP = useTranslations('Praamid')

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
      const res = await fetch('/api/praamid-login/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isikukood: value.isikukood }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(tP('captureFailed', { error: data.error ?? 'start_failed' }))
        return
      }
      setSubmitting(true)
    },
  })
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isFormSubmitting = useStore(form.store, (s) => s.isSubmitting)

  // The card only opens this dialog when the user is *not* authenticated,
  // so the step is driven directly by live status. `submitting` bridges
  // the brief window between form POST and the server writing 'loading'.
  const step: Status =
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
      await fetch('/api/praamid-login/cancel', { method: 'POST' })
    } catch {
      // ignore
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tP('dialogTitle')}</DialogTitle>
          <DialogDescription>{tP('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-[10rem]">
          {step === 'unauthenticated' ? (
            <form
              id="praamid-isikukood-form"
              onSubmit={(e) => {
                e.preventDefault()
                form.handleSubmit()
              }}
              className="flex flex-col gap-3"
            >
              <form.Field name="isikukood" validators={{ onChange: isikukoodSchema }}>
                {(field) => (
                  <div>
                    <Label htmlFor={field.name} className="mb-1 block">
                      {tP('isikukoodLabel')}
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
                      placeholder={tP('isikukoodPlaceholder')}
                      autoFocus
                    />
                    <FieldError field={field} />
                    <p className="mt-1 text-xs text-muted-foreground">{tP('isikukoodHint')}</p>
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
              {tP('cancel')}
            </Button>
          ) : null}
          {step === 'unauthenticated' ? (
            <Button
              type="submit"
              form="praamid-isikukood-form"
              disabled={!canSubmit || isFormSubmitting || submitting}
            >
              {isFormSubmitting || submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {tP('next')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({ current }: { current: Status }) {
  const tP = useTranslations('Praamid')
  const currentIdx = STEP_ORDER.indexOf(current)
  const labels: Record<Status, string> = {
    unauthenticated: tP('step1Title'),
    loading: tP('step2Title'),
    awaiting_confirmation: tP('step3Title'),
    authenticated: tP('step4Title'),
  }
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
              {labels[s]}
            </span>
            {idx < STEP_ORDER.length - 1 ? (
              <span className="h-px w-4 shrink-0 bg-border" aria-hidden />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function LoadingPanel() {
  const tP = useTranslations('Praamid')
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="font-medium">{tP('loadingTitle')}</p>
      <p className="text-muted-foreground">{tP('loadingHint')}</p>
    </div>
  )
}

function AwaitingPanel() {
  const tP = useTranslations('Praamid')
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Smartphone className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{tP('awaitingTitle')}</p>
      <p className="text-xs text-muted-foreground">{tP('awaitingHint')}</p>
    </div>
  )
}

function SuccessPanel() {
  const tP = useTranslations('Praamid')
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <CheckCircle2 className="size-7 text-success" />
      <p className="font-medium">{tP('successTitle')}</p>
      <p className="text-muted-foreground">{tP('successHint')}</p>
    </div>
  )
}
