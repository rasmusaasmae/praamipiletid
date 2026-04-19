'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { ArrowUp, Loader2 } from 'lucide-react'

type Props = { captureUrl: string }

function buildBookmarkletHref(captureUrl: string, nonce: string): string {
  // praamid.ee's CSP blocks fetch to any non-allowlisted origin, so we capture
  // by navigation instead: open our app with user-ctx in the URL fragment, and
  // let the same-origin capture page POST to the API.
  const js = `(()=>{const r=localStorage.getItem('user-ctx');if(!r){alert('Not logged in to praamid.ee');return;}const u=${JSON.stringify(captureUrl)}+'#n='+encodeURIComponent(${JSON.stringify(nonce)})+'&d='+encodeURIComponent(btoa(unescape(encodeURIComponent(r))));window.open(u,'_blank');})()`
  return `javascript:${encodeURIComponent(js)}`
}

export function PraamidBookmarklet({ captureUrl }: Props) {
  const t = useTranslations('Praamid')
  const [nonce, setNonce] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const linkRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/praamid-credentials/nonce', { method: 'POST' })
        if (!res.ok) throw new Error('nonce_failed')
        const data = (await res.json()) as { nonce: string }
        if (!cancelled) setNonce(data.nonce)
      } catch {
        if (!cancelled) {
          toast.error(t('errorNonce'))
          setNonce(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    if (linkRef.current && nonce) {
      linkRef.current.setAttribute('href', buildBookmarkletHref(captureUrl, nonce))
    }
  }, [captureUrl, nonce])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  if (!nonce) return null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        ref={linkRef}
        title={t('bookmarkletTitle')}
        className="inline-flex items-center rounded-md border bg-secondary px-4 py-2 text-base font-medium shadow-sm hover:bg-secondary/80"
        onClick={(e) => e.preventDefault()}
        draggable
      >
        {t('bookmarkletLabel')}
      </a>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowUp className="size-3.5 animate-bounce" />
        {t('dragHint')}
      </span>
    </div>
  )
}
