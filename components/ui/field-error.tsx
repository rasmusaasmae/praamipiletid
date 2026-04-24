'use client'

import type { AnyFieldApi } from '@tanstack/react-form'

type Props = {
  field: AnyFieldApi
  className?: string
}

export function FieldError({ field, className }: Props) {
  if (!field.state.meta.isTouched || field.state.meta.isValid) return null
  const message = field.state.meta.errors
    .map((e) => (typeof e === 'string' ? e : (e?.message ?? '')))
    .filter(Boolean)
    .join(', ')
  if (!message) return null
  return (
    <p className={className ?? 'text-destructive text-sm mt-1'} role="alert">
      {message}
    </p>
  )
}
