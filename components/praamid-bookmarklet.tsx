'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { forgetPraamidCredential } from '@/actions/praamid'

type Props = { appUrl: string }

function buildBookmarkletHref(appUrl: string, nonce: string): string {
  const endpoint = `${appUrl}/api/praamid-credentials`
  const js = `(async()=>{const r=localStorage.getItem('user-ctx');if(!r){alert('Not logged in to praamid.ee');return;}const x=await fetch(${JSON.stringify(endpoint)},{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Praamid-Nonce':${JSON.stringify(nonce)}},body:r});alert(x.ok?'Session captured ✓':'Capture failed: '+x.status);})()`
  return `javascript:${encodeURIComponent(js)}`
}

export function PraamidBookmarklet({ appUrl }: Props) {
  const t = useTranslations('Praamid')
  const [nonce, setNonce] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isForgetting, startForget] = useTransition()

  const fetchNonce = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/praamid-credentials/nonce', { method: 'POST' })
      if (!res.ok) throw new Error('nonce_failed')
      const data = (await res.json()) as { nonce: string }
      setNonce(data.nonce)
    } catch {
      toast.error(t('errorNonce'))
      setNonce(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNonce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {nonce ? (
          <a
            href={buildBookmarkletHref(appUrl, nonce)}
            title={t('bookmarkletTitle')}
            className="inline-flex items-center rounded-md border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
            onClick={(e) => e.preventDefault()}
            draggable
          >
            {t('bookmarkletLabel')}
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">{loading ? t('refreshing') : '—'}</span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={fetchNonce} disabled={loading}>
          {loading ? t('refreshing') : t('refreshNonce')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('howToSteps')}</p>
      <form
        action={() =>
          startForget(async () => {
            if (!confirm(t('forgetConfirm'))) return
            const res = await forgetPraamidCredential()
            if (res.ok) toast.success(t('forgotten'))
            else toast.error(res.error)
          })
        }
      >
        <Button type="submit" variant="destructive" size="sm" disabled={isForgetting}>
          {t('forget')}
        </Button>
      </form>
    </div>
  )
}
