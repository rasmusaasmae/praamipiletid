'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { buttonVariants } from '@/components/ui/button'

type State =
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function PraamidCaptureClient() {
  const t = useTranslations('Praamid')
  const [state, setState] = useState<State>({ kind: 'pending' })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash
    const params = new URLSearchParams(hash)
    const nonce = params.get('n')
    const data = params.get('d')

    history.replaceState(null, '', window.location.pathname + window.location.search)

    if (!nonce || !data) {
      setState({ kind: 'error', message: t('captureMissingData') })
      return
    }

    let body: string
    try {
      body = decodeBase64Utf8(data)
    } catch {
      setState({ kind: 'error', message: t('captureMissingData') })
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/praamid-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Praamid-Nonce': nonce },
          body,
        })
        if (res.ok) {
          setState({ kind: 'success' })
          return
        }
        const detail = await res.json().catch(() => null)
        const message =
          (detail && typeof detail.error === 'string' && detail.error) || `HTTP ${res.status}`
        setState({ kind: 'error', message })
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'fetch_failed',
        })
      }
    })()
  }, [t])

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      {state.kind === 'pending' ? (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('capturing')}</p>
        </>
      ) : state.kind === 'success' ? (
        <>
          <CheckCircle2 className="size-8 text-green-600" />
          <p className="text-base font-medium">{t('captured')}</p>
        </>
      ) : (
        <>
          <XCircle className="size-8 text-destructive" />
          <p className="text-base font-medium">{t('captureFailed', { error: state.message })}</p>
        </>
      )}
      <Link
        href="/settings/praamid"
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        {t('backToSettings')}
      </Link>
    </div>
  )
}
