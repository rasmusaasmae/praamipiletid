'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { forgetPraamidCredential } from '@/actions/praamid-auth'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ForgetButton() {
  const queryClient = useQueryClient()

  const forgetMutation = useMutation({
    mutationFn: () => forgetPraamidCredential(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['praamidAuthState'] })
      toast.success('Session deleted')
    },
    onError: (err) => toast.error(err.message),
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
