import type { PraamidAuthStatus } from '@praamipiletid/praamidee'

import { Badge } from '@/components/ui/badge'

export const STATUS_LABEL: Record<PraamidAuthStatus, string> = {
  unauthenticated: 'Unauthenticated',
  loading: 'Loading',
  awaiting_confirmation: 'Awaiting confirmation',
  authenticated: 'Authenticated',
}

export function StatusBadge({ status }: { status: PraamidAuthStatus }) {
  const variant =
    status === 'authenticated'
      ? 'success'
      : status === 'loading' || status === 'awaiting_confirmation'
        ? 'secondary'
        : 'outline'
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}
