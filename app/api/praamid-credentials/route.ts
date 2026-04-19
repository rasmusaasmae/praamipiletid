import { getSession } from '@/lib/session'
import { consumeCsrfNonce } from '@/lib/praamid-csrf'
import { saveCredential } from '@/lib/praamid-credentials'

const ALLOWED_ORIGIN = 'https://www.praamid.ee'

function corsHeaders(origin: string | null): HeadersInit {
  if (origin !== ALLOWED_ORIGIN) return {}
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-praamid-nonce',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export async function OPTIONS(req: Request) {
  const headers = corsHeaders(req.headers.get('origin'))
  return new Response(null, { status: 204, headers })
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get('origin'))

  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers })
  }

  const nonce = req.headers.get('x-praamid-nonce')
  if (!nonce) {
    return Response.json({ error: 'missing_nonce' }, { status: 400, headers })
  }
  const nonceOk = await consumeCsrfNonce(session.user.id, nonce)
  if (!nonceOk) {
    return Response.json({ error: 'invalid_nonce' }, { status: 403, headers })
  }

  const raw = await req.text()
  if (!raw) {
    return Response.json({ error: 'empty_body' }, { status: 400, headers })
  }

  try {
    const { expiresAt, praamidSub } = await saveCredential(session.user.id, raw)
    return Response.json(
      { ok: true, expiresAt: expiresAt.toISOString(), praamidSub },
      { headers },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'save_failed'
    return Response.json({ error: message }, { status: 400, headers })
  }
}
