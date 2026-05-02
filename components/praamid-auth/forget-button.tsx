'use client'

import { Trash2 } from 'lucide-react'

import { forgetPraamidCredential } from '@/actions/praamid-auth'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOptimisticMutation } from '@/lib/mutations'
import type { PraamidAuthStateView } from '@/lib/queries'

export function ForgetButton() {
  const forgetMutation = useOptimisticMutation<void, PraamidAuthStateView>({
    queryKey: ['praamidAuthState'],
    mutationFn: () => forgetPraamidCredential(),
    optimisticUpdate: () => ({ status: 'unauthenticated', lastError: null }),
    successMessage: 'Session deleted',
  })
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={forgetMutation.isPending}
            aria-label="Delete session"
            onClick={() => {
              if (!confirm('Delete the stored praamid session?')) return
              forgetMutation.mutate()
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <TooltipContent>Delete session</TooltipContent>
    </Tooltip>
  )
}
