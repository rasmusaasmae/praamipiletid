import { useNavigate } from '@tanstack/react-router'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  ticketId: number
  currentDate: string
}

export function OptionsDateFilter({ ticketId, currentDate }: Props) {
  const navigate = useNavigate()

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
          onChange={(e) => {
            const date = e.target.value
            if (!date) return
            void navigate({
              to: '/tickets/$ticketId/options',
              params: { ticketId },
              search: { date },
            })
          }}
        />
      </div>
    </div>
  )
}
