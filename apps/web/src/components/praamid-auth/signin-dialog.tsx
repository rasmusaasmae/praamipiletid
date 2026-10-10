import type { PraamidAuthStatus } from '@ferry-tickets/praamidee'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api, profileQuery } from '@/lib/api'
import { cn } from '@/lib/utils'

const STEP_ORDER: PraamidAuthStatus[] = ['loading', 'awaiting_confirmation', 'authenticated']

const STEP_LABEL: Record<PraamidAuthStatus, string> = {
  unauthenticated: 'Not authenticated',
  loading: 'Opening praamid.ee',
  awaiting_confirmation: 'Confirm',
  authenticated: 'Authenticated',
}

export function SigninDialog({
  open,
  onOpenChange,
  status,
  starting,
  onRetry,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  status: PraamidAuthStatus
  starting: boolean
  onRetry: () => void
}) {
  const queryClient = useQueryClient()
  const { data: profile } = useSuspenseQuery(profileQuery)

  const step: PraamidAuthStatus = starting && status === 'unauthenticated' ? 'loading' : status

  const onCancel = async () => {
    try {
      await api.cancelPraamidLogin()
    } catch {
      // ignore
    }
    void queryClient.invalidateQueries({ queryKey: ['praamidLogin'] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Authenticate with praamid.ee</DialogTitle>
          <DialogDescription>
            We&apos;ll start a Smart-ID session with praamid.ee for ID code {profile.isikukood} and
            store the resulting token so we can keep your ticket fresh.{' '}
            <Link to="/settings" className="hover:text-foreground underline">
              Change ID code
            </Link>
          </DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        <div className="min-h-[10rem]">
          {step === 'loading' ? (
            <LoadingPanel />
          ) : step === 'awaiting_confirmation' ? (
            <AwaitingPanel />
          ) : step === 'authenticated' ? (
            <SuccessPanel />
          ) : (
            <FailedPanel />
          )}
        </div>

        <DialogFooter>
          {step !== 'authenticated' ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {step === 'unauthenticated' ? (
            <Button type="button" onClick={onRetry}>
              Try again
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

function FailedPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm">
      <p className="font-medium">The login didn&apos;t go through</p>
      <p className="text-muted-foreground">Check the ID code and try again.</p>
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
