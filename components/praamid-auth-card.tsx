'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useForm, useStore } from '@tanstack/react-form'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Smartphone, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { cancelPraamidLogin, forgetPraamidCredential, startPraamidLogin } from '@/actions/praamid'
import { isikukoodSchema } from '@/lib/schemas'
import { useOptimisticMutation } from '@/lib/mutations'
import { praamidAuthStateQueryOptions, type PraamidAuthStateView } from '@/lib/query-options'
import { cn } from '@/lib/utils'
import type { PraamidAuthStatus } from '@/db/schema'

export type PraamidCredentialMeta = {
  capturedAt: Date
  expiresAt: Date
  lastVerifiedAt: Date | null
  lastError: string | null
}

type Status = PraamidAuthStatus

const STEP_ORDER: Status[] = [
  'unauthenticated',
  'loading',
  'awaiting_confirmation',
  'authenticated',
]

const STATUS_LABEL: Record<Status, string> = {
  unauthenticated: 'Unauthenticated',
  loading: 'Loading',
  awaiting_confirmation: 'Awaiting confirmation',
  authenticated: 'Authenticated',
}

const STEP_LABEL: Record<Status, string> = {
  unauthenticated: 'Enter ID Code',
  loading: 'Opening praamid.ee',
  awaiting_confirmation: 'Confirm',
  authenticated: 'Authenticated',
}

const DATE_TAG = 'en-GB'

function formatRelativeFuture(to: Date, now: Date): string {
  const diffMs = to.getTime() - now.getTime()
  const sign = diffMs >= 0 ? 'in' : 'ago'
  const abs = Math.abs(diffMs)
  const mins = Math.round(abs / 60_000)
  if (mins < 60) return sign === 'in' ? `in ${mins} min` : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return sign === 'in' ? `in ${hours} h` : `${hours} h ago`
  const days = Math.round(hours / 24)
  return sign === 'in' ? `in ${days} days` : `${days} days ago`
}

export function PraamidAuthCard({
  credentialMeta,
}: {
  credentialMeta: PraamidCredentialMeta | null
}) {
  const router = useRouter()

  const { data: authState } = useSuspenseQuery({
    ...praamidAuthStateQueryOptions,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'loading' || s === 'awaiting_confirmation' ? 1000 : false
    },
  })
  const status = authState.status

  const [dialogOpen, setDialogOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

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
            <CardTitle>praamid.ee</CardTitle>
            <StatusBadge status={status} />
          </div>
          <CardDescription>
            We replay your praamid.ee session to auto-update tickets when a better slot opens.
            Session tokens last up to 7 days — you&apos;ll need to re-authenticate after that.
          </CardDescription>
        </div>
        {isAuthenticated ? <ForgetButton /> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {credentialMeta && isAuthenticated ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="w-fit text-sm text-muted-foreground">
                  Expires {formatRelativeFuture(credentialMeta.expiresAt, now)}
                </p>
              }
            />
            <TooltipContent>
              {credentialMeta.expiresAt.toLocaleString(DATE_TAG, {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {isAuthenticated ? null : (
          <Button type="button" onClick={() => setDialogOpen(true)} className="self-start">
            {isActive ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {STATUS_LABEL[status]}
              </>
            ) : (
              'Authenticate'
            )}
          </Button>
        )}
      </CardContent>

      <SigninDialog open={dialogOpen} onOpenChange={setDialogOpen} status={status} />
    </Card>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const variant =
    status === 'authenticated'
      ? 'success'
      : status === 'loading' || status === 'awaiting_confirmation'
        ? 'secondary'
        : 'outline'
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}

function ForgetButton() {
  const forgetMutation = useOptimisticMutation<void, PraamidAuthStateView>({
    queryKey: praamidAuthStateQueryOptions.queryKey,
    mutationFn: () => forgetPraamidCredential(),
    optimisticUpdate: () => ({ status: 'unauthenticated', lastError: null }),
    successMessage: 'Session deleted',
  })
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={forgetMutation.isPending}
            aria-label="Delete session"
            onClick={() => {
              if (!confirm('Delete the stored praamid session?')) return
              forgetMutation.mutate()
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <TooltipContent>Delete session</TooltipContent>
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
        queryClient.invalidateQueries({
          queryKey: praamidAuthStateQueryOptions.queryKey,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'start_failed'
        toast.error(`Capture failed: ${message}`)
      }
    },
  })
  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const isFormSubmitting = useStore(form.store, (s) => s.isSubmitting)

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
      await cancelPraamidLogin()
    } catch {
      // ignore
    }
    queryClient.invalidateQueries({ queryKey: praamidAuthStateQueryOptions.queryKey })
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
                form.handleSubmit()
              }}
              className="flex flex-col gap-3"
            >
              <form.Field name="isikukood" validators={{ onChange: isikukoodSchema }}>
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
                    <p className="mt-1 text-xs text-muted-foreground">
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

function Stepper({ current }: { current: Status }) {
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
              <span className="h-px w-4 shrink-0 bg-border" aria-hidden />
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
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
      <Smartphone className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">Approve on your phone</p>
      <p className="text-xs text-muted-foreground">
        Open the Smart-ID app and approve the request.
      </p>
    </div>
  )
}

function SuccessPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <CheckCircle2 className="size-7 text-success" />
      <p className="font-medium">You&apos;re authenticated</p>
      <p className="text-muted-foreground">Session saved. You can close this window.</p>
    </div>
  )
}
