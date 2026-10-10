'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { PraamidAuthStatus } from '@/lib/praamidee'
import { getMyPraamidAuthState } from '@/lib/queries'

import { ForgetButton } from './forget-button'
import { SigninDialog } from './signin-dialog'
import { STATUS_LABEL, StatusBadge } from './status-badge'

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

export function PraamidAuthCard() {
  const router = useRouter()

  const { data: info } = useSuspenseQuery({
    queryKey: ['praamidAuthState'],
    queryFn: () => getMyPraamidAuthState(),
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'loading' || s === 'awaiting_confirmation' ? 1000 : false
    },
  })
  const status = info.status

  const [dialogOpen, setDialogOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const prevStatus = useRef<PraamidAuthStatus>(status)
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
        {info.expiresAt && isAuthenticated ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="text-muted-foreground w-fit text-sm">
                  Expires {formatRelativeFuture(info.expiresAt, now)}
                </p>
              }
            />
            <TooltipContent>
              {info.expiresAt.toLocaleString(DATE_TAG, {
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
