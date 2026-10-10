import { revalidateLogic, useForm } from '@tanstack/react-form'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, profileQuery } from '@/lib/api'

const profileSchema = z.object({
  isikukood: z.string().regex(/^\d{11}$/, 'An Estonian ID code is 11 digits.'),
})

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: profile } = useSuspenseQuery(profileQuery)

  const form = useForm({
    defaultValues: { isikukood: profile.isikukood ?? '' },
    // Checked on the first submit, then as you type.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: profileSchema },
    onSubmit: async ({ value }) => {
      try {
        await api.saveProfile(value)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Saving failed')
        return
      }
      queryClient.setQueryData(profileQuery.queryKey, value)
      toast.success('Settings saved')
      await navigate({ to: '/' })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your Estonian ID code starts the Smart-ID login to praamid.ee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
            className="flex flex-col items-start gap-3"
          >
            <form.Field name="isikukood">
              {(field) => (
                <div className="w-full max-w-xs">
                  <Label htmlFor={field.name} className="mb-1 block">
                    Estonian ID code
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={11}
                    placeholder="11 digits"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <FieldError field={field} />
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  Save
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
