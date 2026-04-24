import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'

// Wraps a server action in a useMutation with optimistic cache writes,
// automatic rollback on failure, and invalidation on settle. The callback
// shape mirrors TanStack's own onMutate/onError/onSettled but centralises
// the boilerplate we repeat per mutation.
export function useOptimisticMutation<TVars, TData>(options: {
  queryKey: QueryKey
  mutationFn: (vars: TVars) => Promise<unknown>
  optimisticUpdate: (old: TData, vars: TVars) => TData
  successMessage?: string
}) {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, TVars, { previous: TData | undefined }>({
    mutationFn: options.mutationFn,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: options.queryKey })
      const previous = queryClient.getQueryData<TData>(options.queryKey)
      if (previous !== undefined) {
        queryClient.setQueryData<TData>(
          options.queryKey,
          options.optimisticUpdate(previous, vars),
        )
      }
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<TData>(options.queryKey, context.previous)
      }
      toast.error(err.message)
    },
    onSuccess: () => {
      if (options.successMessage) toast.success(options.successMessage)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: options.queryKey })
    },
  })
}
