import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.redirect(new URL('/sign-in', request.url))
  return NextResponse.next()
}

// Match every path except: sign-in, anything under /api (auth handler,
// health), Next.js internals, and any file with an extension (favicons,
// /ferry.svg).
export const config = {
  matcher: ['/((?!sign-in|api|_next|.*\\..*).*)'],
}
