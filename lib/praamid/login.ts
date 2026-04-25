import 'server-only'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

import { logger } from '@/lib/logger'
import { setAuthState, settleAuthState } from '@/lib/praamid/auth-state'
import { saveCredential } from '@/lib/praamid/credentials'

const log = logger.child({ scope: 'praamid-login' })

const ENTRY_URL = 'https://www.praamid.ee/portal/integration/wp?action=login&redirectPath=/'

const SESSION_TTL_MS = 3 * 60 * 1000 // 3 minutes total

type Session = {
  userId: string
  context: BrowserContext
  page: Page
  cancelled: boolean
  deadline: number
  driver: Promise<void>
}

const sessions = new Map<string, Session>()

let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] })
      .catch((err) => {
        browserPromise = null
        throw err
      })
  }
  return browserPromise
}

async function cleanupSession(userId: string): Promise<void> {
  const s = sessions.get(userId)
  if (!s) return
  sessions.delete(userId)
  try {
    await s.context.close()
  } catch {
    // ignore
  }
}

export async function cancelLogin(userId: string): Promise<void> {
  const s = sessions.get(userId)
  if (!s) return
  s.cancelled = true
  await cleanupSession(userId)
  await settleAuthState(userId)
}

export async function startLogin(userId: string, isikukood: string): Promise<void> {
  if (!/^\d{11}$/.test(isikukood)) {
    throw new Error('invalid_isikukood')
  }

  // Any previous in-flight session for this user is discarded.
  await cancelLogin(userId)
  await setAuthState(userId, { status: 'loading' })

  const browser = await getBrowser()
  const context = await browser.newContext({
    locale: 'et-EE',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  const session: Session = {
    userId,
    context,
    page,
    cancelled: false,
    deadline: Date.now() + SESSION_TTL_MS,
    driver: Promise.resolve(),
  }
  sessions.set(userId, session)

  session.driver = driveLogin(session, isikukood).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    log.warn({ userId, err: message }, 'driver failed')
    await cleanupSession(userId)
    if (!session.cancelled) {
      await settleAuthState(userId, { lastError: message })
    }
  })
}

async function driveLogin(session: Session, isikukood: string): Promise<void> {
  const { page } = session

  // Set up the token-exchange response listener before navigating — the
  // SPA fires POST /openid-connect/token right after the OIDC redirect
  // lands, and we'd miss it if we armed the listener later.
  const tokensPromise = waitForTokenExchange(page)

  await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded' })
  if (session.cancelled) return

  // Step 1: credential picker. Click the Smart-ID button. We used to call
  // Keycloak's internal onclick handler directly with a hardcoded authExec
  // UUID, but praamid.ee rewrites their theme periodically (function name,
  // hidden-input id, and UUID all changed in April 2026). Clicking the real
  // button by its visible label survives those cosmetic rewrites.
  const smartIdBtn = page.locator('button:has-text("Smart-ID")').first()
  await smartIdBtn.waitFor({ state: 'visible', timeout: 20000 })
  if (session.cancelled) return
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), smartIdBtn.click()])

  // Step 2: Smart-ID form — fill isikukood and submit.
  await page.waitForSelector('#sid-personal-code', { timeout: 15000 })
  if (session.cancelled) return
  await page.fill('#sid-personal-code', isikukood)
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#kc-login'),
  ])

  // Step 3: Smart-ID is now pending user approval on the phone. Mark
  // awaiting_confirmation so the UI can advance to the confirm step.
  if (session.cancelled) return
  await setAuthState(session.userId, { status: 'awaiting_confirmation' })

  // Step 4: wait for the final callback that closes the OIDC flow. The
  // browser ends up on www.praamid.ee with success=true.
  await page.waitForURL(
    (url) => url.hostname === 'www.praamid.ee' && url.searchParams.get('success') === 'true',
    { timeout: SESSION_TTL_MS },
  )
  if (session.cancelled) return

  // Step 5: wait for the token-exchange response the SPA fires after the
  // OIDC redirect. Gives us access_token + refresh_token directly — the
  // access_token is no longer stashed in localStorage (April 2026 change).
  const tokens = await tokensPromise
  if (session.cancelled) return

  await saveCredential(session.userId, tokens)
  await cleanupSession(session.userId)
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
  const body = (await resp.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (!body.access_token || !body.refresh_token) {
    throw new Error('token response missing access_token/refresh_token')
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}
