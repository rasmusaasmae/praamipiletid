'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateNtfyTopic } from '@/actions/user-settings'

export function SettingsForm({ currentTopic, ntfyBase }: { currentTopic: string; ntfyBase: string }) {
  const [topic, setTopic] = useState(currentTopic)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) =>
        startTransition(async () => {
          const res = await updateNtfyTopic(formData)
          if (res.ok) toast.success('Salvestatud')
          else toast.error(res.error)
        })
      }
    >
      <div>
        <Label htmlFor="ntfyTopic" className="mb-1 block">
          Teema
        </Label>
        <Input
          id="ntfyTopic"
          name="ntfyTopic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          pattern="^[A-Za-z0-9_-]+$"
          minLength={4}
          maxLength={64}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          URL: {ntfyBase}/{topic || '<teema>'}
        </p>
      </div>
      <Button type="submit" disabled={isPending || topic === currentTopic} className="self-start">
        {isPending ? 'Salvestan…' : 'Salvesta'}
      </Button>
    </form>
  )
}
