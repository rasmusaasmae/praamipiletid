// Scout the praamid.ee / Keycloak login flow by driving a real Chrome and
// dumping HTML + a screenshot of every page we land on.
//
// Usage:
//   bun run scripts/scout-praamid-login.ts
//
// The browser opens headed at the portal login entry — just proceed through
// Smart-ID (or whichever method) as you normally would. The script watches
// main-frame navigation events and writes /tmp/scout-praamid/<N>-<host-path>.html
// after each transition.  It also polls localStorage and writes
// localstorage.json once user-ctx appears.  The script exits automatically
// ~10s after user-ctx is captured, or when you close the browser.

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'

const OUT_DIR = '/tmp/scout-praamid'

function slug(url: string): string {
  try {
    const u = new URL(url)
    return (u.host + u.pathname).replace(/[^a-z0-9]+/gi, '_').slice(0, 60)
  } catch {
    return url.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log(`[scout] dumping artifacts to ${OUT_DIR}`)

  const browser = await chromium.launch({ headless: false, channel: 'chrome' })
  const ctx = await browser.newContext({
    locale: 'et-EE',
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()

  let stepCounter = 0
  let pending: Promise<void> = Promise.resolve()
  const dumped = new Map<string, number>() // url → count (let us see repeat visits)

  async function tryDump(reason: string, attempt: number): Promise<boolean> {
    try {
      const url = page.url()
      const visits = (dumped.get(url) ?? 0) + 1
      const html = await page.content()
      dumped.set(url, visits)
      const step = ++stepCounter
      const stem = `${String(step).padStart(2, '0')}-${slug(url)}${visits > 1 ? `-v${visits}` : ''}`
      await writeFile(
        join(OUT_DIR, `${stem}.html`),
        `<!-- reason: ${reason} -->\n<!-- attempt: ${attempt} -->\n<!-- url: ${url} -->\n${html}`,
      )
      try {
        await page.screenshot({ path: join(OUT_DIR, `${stem}.png`), fullPage: true })
      } catch {
        // screenshots can race with navigation; html is what matters
      }
      console.log(`[scout] step ${step} (${reason}, attempt ${attempt}) → ${url}`)
      return true
    } catch {
      return false
    }
  }

  async function dumpAfterSettle(reason: string): Promise<void> {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 700))
      if (await tryDump(reason, 1)) return
      // Retry for up to ~8s — the verification-code page sometimes only
      // settles after Smart-ID polling kicks in.
      for (let i = 2; i <= 8; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        if (await tryDump(reason, i)) return
      }
      console.warn(`[scout] gave up dumping for ${reason} after 8 attempts`)
    } catch (err) {
      console.warn(`[scout] dump loop crashed for ${reason}:`, err instanceof Error ? err.message : err)
    }
  }

  function schedule(reason: string): void {
    // serialise dumps so we never try to grab content while navigating
    pending = pending.then(() => dumpAfterSettle(reason))
  }

  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) schedule(`nav:${f.url()}`)
  })

  // Also poll the DOM to catch in-place DOM swaps (e.g. a spinner turning
  // into a verification-code display without a navigation).
  const pollInterval = setInterval(async () => {
    try {
      const marker = await page.evaluate(() => {
        const text = document.body?.innerText ?? ''
        const code = text.match(/\b(\d{4})\b/)?.[1] ?? null
        return { len: text.length, url: location.href, hasVerifyWord: /kontroll|verifi|veri|PIN/i.test(text), code }
      })
      if (marker.hasVerifyWord || marker.code) {
        schedule(`dom:verify-marker code=${marker.code}`)
      }
    } catch {
      // ignore — page might be mid-navigation
    }
  }, 2000)

  // Also poll for user-ctx in localStorage so we know when we're done.
  let userCtxSeenAt = 0
  const localStoragePoll = setInterval(async () => {
    try {
      const v = await page.evaluate(() => {
        try {
          return window.localStorage.getItem('user-ctx')
        } catch {
          return null
        }
      })
      if (v && !userCtxSeenAt) {
        userCtxSeenAt = Date.now()
        console.log(`[scout] user-ctx appeared in localStorage (len=${v.length})`)
        schedule('user-ctx-appeared')
        // Give it a moment for any last mutations, then dump localStorage.
        setTimeout(async () => {
          try {
            const storage = await page.evaluate(() => {
              const out: Record<string, { len: number; sample: string }> = {}
              for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i)
                if (!k) continue
                const val = window.localStorage.getItem(k) ?? ''
                out[k] = { len: val.length, sample: val.slice(0, 300) }
              }
              return out
            })
            await writeFile(join(OUT_DIR, 'localstorage.json'), JSON.stringify(storage, null, 2))
            console.log('[scout] localStorage keys:', Object.keys(storage).join(', '))
          } catch (err) {
            console.warn('[scout] localstorage dump failed:', err)
          }
        }, 3000)
      }
    } catch {
      // ignore
    }
  }, 2000)

  page.on('close', () => {
    clearInterval(pollInterval)
    clearInterval(localStoragePoll)
  })

  // Watchdog: close 10s after we see user-ctx, so we exit cleanly.
  const watchdog = setInterval(async () => {
    if (userCtxSeenAt && Date.now() - userCtxSeenAt > 10000) {
      console.log('[scout] user-ctx seen 10s ago — wrapping up')
      clearInterval(watchdog)
      clearInterval(pollInterval)
      clearInterval(localStoragePoll)
      await pending
      await browser.close().catch(() => {})
    }
  }, 1000)

  console.log('[scout] opening https://www.praamid.ee/portal/integration/wp?action=login&redirectPath=/')
  try {
    await page.goto('https://www.praamid.ee/portal/integration/wp?action=login&redirectPath=/', {
      waitUntil: 'load',
    })
  } catch (err) {
    console.warn('[scout] initial goto warning (continuing):', err)
  }
  console.log('[scout] now just log in normally — close Chrome when done, or wait for auto-exit')
}

main().catch((err) => {
  console.error('[scout] failed:', err)
  process.exit(1)
})
