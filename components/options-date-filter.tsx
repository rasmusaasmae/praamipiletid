'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  bookingUid: string
  currentDate: string
}

export function OptionsDateFilter({ bookingUid, currentDate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px]">
      <div>
        <Label htmlFor="date" className="mb-1 block">
          Date
        </Label>
        <Input
          id="date"
          type="date"
          defaultValue={currentDate}
          disabled={isPending}
          onChange={(e) => {
            const date = e.target.value
            if (!date) return
            const qs = new URLSearchParams({ date })
            startTransition(() =>
              router.push(`/tickets/${bookingUid}/options?${qs.toString()}`),
            )
          }}
        />
      </div>
    </div>
  )
}
