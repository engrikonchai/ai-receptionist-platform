'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { saveBusinessInfoStepMutation } from '../api/queries';
import {
  BUSINESS_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  businessInfoStepSchema,
  type BusinessType,
  type LanguageCode
} from '../schemas/onboarding';

/**
 * The standalone "edit your business profile" form for the Settings
 * page — reuses the exact same schema and save action as the
 * onboarding wizard's Business information step
 * (src/features/onboarding/api/service.ts's saveBusinessInfoStep),
 * never a duplicate write path. This is what lets an owner fix up their
 * business profile from the dashboard checklist without ever being
 * routed back through the one-time /onboarding wizard, including for a
 * second business that was never onboarded through that wizard at all
 * (the wizard only ever touches the owner's oldest business — see
 * resolveOnboardingResumeStep's own doc comment).
 */
export function BusinessProfileForm({
  businessId,
  defaultValues
}: {
  businessId: string;
  defaultValues: {
    businessName: string;
    businessType: BusinessType;
    location: string;
    defaultLanguage: LanguageCode;
    supportedLanguages: LanguageCode[];
  };
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation(saveBusinessInfoStepMutation(businessId));

  const form = useAppForm({
    defaultValues: { ...defaultValues, websiteUrl: '' },
    validators: { onSubmit: businessInfoStepSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const result = await saveMutation.mutateAsync(value);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      toast.success('Business profile saved.');
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField
          name='businessName'
          children={(field) => (
            <field.TextField
              label='Business name'
              required
              placeholder='e.g. Riviera Stay Apartments'
            />
          )}
        />
        <form.AppField
          name='businessType'
          children={(field) => (
            <field.SelectField
              label='Business type'
              required
              options={BUSINESS_TYPE_OPTIONS}
              placeholder='Select a business type'
            />
          )}
        />
        <form.AppField
          name='location'
          children={(field) => (
            <field.TextField label='Location' placeholder='e.g. Budva, Montenegro' />
          )}
        />
        <form.AppField
          name='defaultLanguage'
          children={(field) => (
            <field.SelectField
              label='Default language'
              required
              options={LANGUAGE_OPTIONS}
              placeholder='Select a default language'
            />
          )}
        />
        <form.AppField
          name='supportedLanguages'
          mode='array'
          children={(field) => (
            <field.CheckboxGroupField
              label='Supported languages'
              required
              options={LANGUAGE_OPTIONS}
              description='Your AI receptionist will reply in these languages.'
            />
          )}
        />

        {formError && (
          <p role='alert' className='text-destructive text-sm'>
            {formError}
          </p>
        )}

        <div className='flex justify-end pb-[env(safe-area-inset-bottom)]'>
          <form.AppForm>
            <form.SubmitButton className='h-11 w-full sm:h-8 sm:w-auto'>
              Save changes
            </form.SubmitButton>
          </form.AppForm>
        </div>
      </FieldGroup>
    </form>
  );
}
