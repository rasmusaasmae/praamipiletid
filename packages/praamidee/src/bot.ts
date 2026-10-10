import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import type { CredentialStore } from './credentials'
import type { AuthStateStore } from './state'
import type { TokenManager } from './tokens'

const ENTRY_URL = 'https://www.praamid.ee/portal/integration/wp?action=login&redirectPath=/'

const SESSION_TTL_MS = 3 * 60 * 1000 // 3 minutes total

type Session = {
  userId: string
  context: BrowserContext
  page: Page
  cancelled: boolean
}

type Deps = {
  credentials: CredentialStore
  tokens: TokenManager
  state: AuthStateStore
  onError?: (userId: string, message: string) => void
}

// Drives the praamid.ee Smart-ID login in a headless browser and captures the
// resulting tokens. One session per user; a new start replaces the old one.
export function createLoginBot({ credentials, tokens, state, onError }: Deps) {
  const sessions = new Map<string, Session>()
  let browserPromise: Promise<Browser> | null = null

  function getBrowser(): Promise<Browser> {
    browserPromise ??= chromium
      .launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
      .catch((err) => {
        browserPromise = null
        throw err
      })
    return browserPromise
  }

  async function cleanup(userId: string): Promise<void> {
    const s = sessions.get(userId)
    if (!s) return
    sessions.delete(userId)
    await s.context.close().catch(() => {})
  }

  async function cancel(userId: string): Promise<void> {
    const s = sessions.get(userId)
    if (!s) return
    s.cancelled = true
    await cleanup(userId)
    await state.settle(userId)
  }

  async function start(userId: string, isikukood: string): Promise<void> {
    if (!/^\d{11}$/.test(isikukood)) {
      throw new Error('invalid_isikukood')
    }

    await cancel(userId)
    await state.set(userId, 'loading')

    const context = await (
      await getBrowser()
    ).newContext({ locale: 'et-EE', viewport: { width: 1280, height: 900 } })
    const session: Session = { userId, context, page: await context.newPage(), cancelled: false }
    sessions.set(userId, session)

    void drive(session, isikukood).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err)
      onError?.(userId, message)
      await cleanup(userId)
      if (!session.cancelled) await state.settle(userId, message)
    })
  }

  async function drive(session: Session, isikukood: string): Promise<void> {
    const { page } = session

    // Set up the token-exchange response listener before navigating — the
    // SPA fires POST /openid-connect/token right after the OIDC redirect
    // lands, and we'd miss it if we armed the listener later.
    const tokensPromise = waitForTokenExchange(page)

    await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded' })
    if (session.cancelled) return

    // Step 1: credential picker. Click the Smart-ID button by its visible
    // label; praamid.ee rewrites their Keycloak theme periodically and the
    // label survives those cosmetic rewrites.
    const smartIdBtn = page.locator('button:has-text("Smart-ID")').first()
    await smartIdBtn.waitFor({ state: 'visible', timeout: 20000 })
    if (session.cancelled) return
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      smartIdBtn.click(),
    ])

    // Step 2: Smart-ID form — fill isikukood and submit.
    await page.waitForSelector('#sid-personal-code', { timeout: 15000 })
    if (session.cancelled) return
    await page.fill('#sid-personal-code', isikukood)
    await Promise.all([
      page.waitForLoadState('domcontentloaded').catch(() => {}),
      page.click('#kc-login'),
    ])

    // Step 3: Smart-ID is now pending user approval on the phone.
    if (session.cancelled) return
    await state.set(session.userId, 'awaiting_confirmation')

    // Step 4: wait for the final callback that closes the OIDC flow. The
    // browser ends up on www.praamid.ee with success=true.
    await page.waitForURL(
      (url) => url.hostname === 'www.praamid.ee' && url.searchParams.get('success') === 'true',
      { timeout: SESSION_TTL_MS },
    )
    if (session.cancelled) return

    // Step 5: the token-exchange response the SPA fires after the OIDC
    // redirect gives us access_token + refresh_token directly.
    const captured = await tokensPromise
    if (session.cancelled) return

    await credentials.save(session.userId, captured)
    tokens.invalidate(session.userId)
    await state.set(session.userId, 'authenticated')
    await cleanup(session.userId)
  }

  return {
    start,
    cancel,
    async close(): Promise<void> {
      for (const userId of sessions.keys()) await cleanup(userId)
      if (browserPromise) await (await browserPromise).close().catch(() => {})
    },
  }
}

async function waitForTokenExchange(
  page: Page,
): Promise<{ accessToken: string; refreshToken: string }> {
  const resp = await page.waitForResponse(
    (r) =>
      r.url().includes('/auth/realms/praamid-online/protocol/openid-connect/token') &&
      r.request().method() === 'POST' &&
      r.ok(),
    { timeout: SESSION_TTL_MS },
  )
  const body = (await resp.json()) as { access_token?: string; refresh_token?: string }
  if (!body.access_token || !body.refresh_token) {
    throw new Error('token response missing access_token/refresh_token')
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}

export type LoginBot = ReturnType<typeof createLoginBot>
