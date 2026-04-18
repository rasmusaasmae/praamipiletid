'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  directions: ReadonlyArray<{ code: string; label: string }>
  currentDirection: string
  currentDate: string
}

export function TripsFilter({ directions, currentDirection, currentDate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const push = (direction: string, date: string) => {
    const params = new URLSearchParams({ direction, date })
    startTransition(() => router.push(`/trips?${params.toString()}`))
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
      <div>
        <Label htmlFor="direction" className="mb-1 block">
          Suund
        </Label>
        <Select
          value={currentDirection}
          onValueChange={(v) => v && push(v, currentDate)}
          disabled={isPending}
        >
          <SelectTrigger id="direction" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {directions.map((d) => (
              <SelectItem key={d.code} value={d.code}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="date" className="mb-1 block">
          Kuupäev
        </Label>
        <Input
          id="date"
          type="date"
          defaultValue={currentDate}
          disabled={isPending}
          onChange={(e) => {
            if (e.target.value) push(currentDirection, e.target.value)
          }}
        />
      </div>
    </div>
  )
}
