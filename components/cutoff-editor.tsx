'use client'

import { useForm, useStore } from '@tanstack/react-form'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function CutoffEditor({
  stopBeforeMinutes,
  disabled,
  onSave,
  titleText,
}: {
  stopBeforeMinutes: number
  disabled: boolean
  onSave: (minutes: number) => void
  titleText: string
}) {
  const [open, setOpen] = useState(false)

  const form = useForm({
    defaultValues: { minutes: stopBeforeMinutes },
    validators: {
      onChange: ({ value }) => {
        if (!Number.isFinite(value.minutes) || value.minutes < 0) {
          return 'Must be a non-negative number'
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => {
      setOpen(false)
      onSave(Math.floor(value.minutes))
    },
  })

  const canSubmit = useStore(form.store, (s) => s.canSubmit)
  const formErrors = useStore(form.store, (s) => s.errors)

  const onOpenChange = (next: boolean) => {
    if (next) form.reset({ minutes: stopBeforeMinutes })
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex items-baseline gap-1 rounded text-left disabled:pointer-events-none disabled:opacity-50"
                >
                  <span>{titleText}</span>
                  <span className="text-muted-foreground hover:text-foreground text-xs font-normal underline decoration-dotted underline-offset-2">
                    stop {stopBeforeMinutes} min before
                  </span>
                </button>
              }
            />
          }
        />
        <TooltipContent>
          We stop auto-swapping this alternative this many minutes before its departure.
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-auto">
        <PopoverHeader>
          <PopoverTitle>Stop swapping</PopoverTitle>
          <PopoverDescription>
            We stop auto-swapping this alternative this many minutes before its departure.
          </PopoverDescription>
        </PopoverHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-2"
        >
          <form.Field name="minutes">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label htmlFor="cutoff-minutes" className="text-xs">
                  Minutes before departure
                </Label>
                <Input
                  id="cutoff-minutes"
                  type="number"
                  min={0}
                  step={5}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  className="h-8 w-28 text-sm tabular-nums"
                />
              </div>
            )}
          </form.Field>
          {formErrors.length > 0 ? (
            <p className="text-destructive text-xs" role="alert">
              {formErrors
                .map((err) => (typeof err === 'string' ? err : ''))
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!canSubmit}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
