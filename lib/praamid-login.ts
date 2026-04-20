import 'server-only'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { createLogger } from '@/lib/logger'
import { saveCredential } from '@/lib/praamid-credentials'

const log = createLogger('praamid-login')

const ENTRY_URL =
  'https://www.praamid.ee/portal/integration/wp?action=login&redirectPath=/'

const SMART_ID_EXEC = '2a3354b3-0f4b-4fe3-86d5-cec6c6e016da'

const SESSION_TTL_MS = 3 * 60 * 1000 // 3 minutes total
const POLL_INTERVAL_MS = 500

export type LoginState =
  | { kind: 'pending' }
  | { kind: 'awaiting_code'; code: string }
  | { kind: 'success'; praamidSub: string; expiresAt: string }
  | { kind: 'error'; error: string }
  | { kind: 'cancelled' }

type Session = {
  userId: string
  state: LoginState
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
    const headless = process.env.PRAAMID_LOGIN_HEADLESS !== 'false'
    browserPromise = chromium
      .launch({ headless, args: ['--disable-blink-features=AutomationControlled'] })
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
  if (s.state.kind === 'pending' || s.state.kind === 'awaiting_code') {
    s.state = { kind: 'cancelled' }
  }
  await cleanupSession(userId)
}

export function getLoginState(userId: string): LoginState | null {
  const s = sessions.get(userId)
  if (!s) return null
  if (Date.now() > s.deadline && (s.state.kind === 'pending' || s.state.kind === 'awaiting_code')) {
    s.state = { kind: 'error', error: 'timeout' }
    void cleanupSession(userId)
  }
  return s.state
}

export async function startLogin(userId: string, isikukood: string): Promise<void> {
  if (!/^\d{11}$/.test(isikukood)) {
    throw new Error('invalid_isikukood')
  }

  // Any previous in-flight session for this user is discarded.
  await cancelLogin(userId)

  const browser = await getBrowser()
  const context = await browser.newContext({
    locale: 'et-EE',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  const session: Session = {
    userId,
    state: { kind: 'pending' },
    context,
    page,
    cancelled: false,
    deadline: Date.now() + SESSION_TTL_MS,
    driver: Promise.resolve(),
  }
  sessions.set(userId, session)

  session.driver = driveLogin(session, isikukood).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('driver failed', { userId, err: message })
    if (session.state.kind === 'pending' || session.state.kind === 'awaiting_code') {
      session.state = { kind: 'error', error: message }
    }
    await cleanupSession(userId)
  })
}

async function driveLogin(session: Session, isikukood: string): Promise<void> {
  const { page } = session

  await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded' })
  if (session.cancelled) return

  // Step 1: credential picker. Click the Smart-ID option via its known authExec ID.
  await page.waitForFunction(
    (execId) =>
      typeof (window as unknown as { fillAndSubmit?: unknown }).fillAndSubmit === 'function' &&
      !!document.getElementById('authexec-hidden-input') &&
      !!document.querySelector(`[onclick*="${execId}"]`),
    SMART_ID_EXEC,
    { timeout: 20000 },
  )
  if (session.cancelled) return
  await page.evaluate((execId) => {
    ;(window as unknown as { fillAndSubmit: (id: string) => void }).fillAndSubmit(execId)
  }, SMART_ID_EXEC)

  // Step 2: Smart-ID form — fill isikukood and submit.
  await page.waitForSelector('#sid-personal-code', { timeout: 15000 })
  if (session.cancelled) return
  await page.fill('#sid-personal-code', isikukood)
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.click('#kc-login'),
  ])

  // Step 3: verification-code page. Keycloak renders a 4-digit code while it
  // polls the Smart-ID RP-API. Detect it defensively by scanning for any
  // visible element whose text is exactly a 4-digit number.
  const code = await pollForVerificationCode(session)
  if (session.cancelled) return
  session.state = { kind: 'awaiting_code', code }

  // Step 4: wait for the final callback that closes the OIDC flow. The
  // browser ends up on www.praamid.ee with success=true.
  await page.waitForURL(
    (url) => url.hostname === 'www.praamid.ee' && url.searchParams.get('success') === 'true',
    { timeout: SESSION_TTL_MS },
  )
  if (session.cancelled) return

  // Step 5: praamid SPA writes user-ctx into localStorage once it exchanges
  // the authorization code. Wait for it.
  const userCtx = await page.waitForFunction(
    () => {
      try {
        return window.localStorage.getItem('user-ctx')
      } catch {
        return null
      }
    },
    null,
    { timeout: 30000, polling: 500 },
  )
  if (session.cancelled) return
  const raw = await userCtx.jsonValue()
  if (typeof raw !== 'string' || !raw) {
    throw new Error('user-ctx missing')
  }

  const { expiresAt, praamidSub } = await saveCredential(session.userId, raw)
  session.state = {
    kind: 'success',
    praamidSub,
    expiresAt: expiresAt.toISOString(),
  }
  await cleanupSession(session.userId)
}

async function pollForVerificationCode(session: Session): Promise<string> {
  const { page } = session
  const start = Date.now()
  const deadline = Math.min(session.deadline, start + 30_000)

  while (Date.now() < deadline) {
    if (session.cancelled) throw new Error('cancelled')
    try {
      const code = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
        let n: Node | null = walker.currentNode
        while ((n = walker.nextNode())) {
          const el = n as HTMLElement
          const text = (el.textContent ?? '').trim()
          if (/^\d{4}$/.test(text) && el.children.length === 0) {
            return text
          }
        }
        return null
      })
      if (code) return code
    } catch {
      // navigation; retry
    }
    // If the URL already advanced past verification to the callback, there
    // was no user-visible code (e.g. user approved before we polled).
    try {
      const url = new URL(page.url())
      if (url.hostname === 'www.praamid.ee' && url.searchParams.get('success') === 'true') {
        return ''
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error('verification_code_timeout')
}
