'use client';

import { useState } from 'react';
import { revalidateLogic, useStore } from '@tanstack/react-form';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { useAppForm } from '@/lib/form';
import { useFormStepper } from '@/hooks/use-stepper';
import { completeOnboarding } from '../actions/complete-onboarding';
import {
  BUSINESS_TYPE_OPTIONS,
  LANGUAGE_LABEL,
  LANGUAGE_OPTIONS,
  onboardingSchema,
  onboardingStepSchemas,
  type BusinessType,
  type LanguageCode
} from '../schemas/onboarding';

export type OnboardingDefaults = {
  businessName: string;
  businessType: BusinessType;
  location: string;
  defaultLanguage: LanguageCode;
  supportedLanguages: LanguageCode[];
  handoffEmail: string;
  widgetTitle: string;
  welcomeMessage: string;
};

const STEP_TITLES = ['Your business', 'Location & languages', 'Customer handoff'];
const STEP_DESCRIPTIONS = [
  'Tell us the basics — you can change these later in Settings.',
  'Where guests reach you, and which languages your AI receptionist should speak.',
  'How customers reach a human, and what your chat widget says first.'
];

export function OnboardingFlow({ defaultValues }: { defaultValues: OnboardingDefaults }) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    step,
    currentStep,
    isFirstStep,
    currentValidator,
    handleNextStepOrSubmit,
    handleCancelOrBack
  } = useFormStepper(onboardingStepSchemas, { fullSchema: onboardingSchema });

  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: currentValidator as typeof onboardingSchema,
      onDynamicAsyncDebounceMs: 500
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      // On success, completeOnboarding() redirects server-side (see its
      // own comment) by throwing — it never resolves with a value in
      // that case. So actually getting a result back here always means
      // it did NOT succeed; there is deliberately no success branch to
      // navigate from client-side.
      const result = await completeOnboarding(value);
      if (!result.success) {
        setSubmitError(result.error);
      }
    }
  });

  const defaultLanguage = useStore(form.store, (s) => s.values.defaultLanguage);
  const totalSteps = onboardingStepSchemas.length;

  const handleNext = async () => {
    await handleNextStepOrSubmit(form);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleNext();
      }}
      noValidate
      className='space-y-6'
    >
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-sm'>
            Step {currentStep} of {totalSteps}
          </span>
          <span className='text-muted-foreground text-sm'>{STEP_TITLES[currentStep - 1]}</span>
        </div>
        <Progress value={(currentStep / totalSteps) * 100} aria-label='Onboarding progress' />
      </div>

      <div className='space-y-1'>
        <h1 className='text-foreground text-xl font-semibold'>{STEP_TITLES[currentStep - 1]}</h1>
        <p className='text-muted-foreground text-sm'>{STEP_DESCRIPTIONS[currentStep - 1]}</p>
      </div>

      {currentStep === 1 && (
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
        </FieldGroup>
      )}

      {currentStep === 2 && (
        <FieldGroup>
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
        </FieldGroup>
      )}

      {currentStep === 3 && (
        <FieldGroup>
          <form.AppField
            name='handoffEmail'
            children={(field) => (
              <field.TextField
                label='Handoff email'
                type='email'
                required
                placeholder='you@example.com'
                description='Where hand-off requests and enquiries are sent.'
              />
            )}
          />
          <form.AppField
            name='widgetTitle'
            children={(field) => (
              <field.TextField
                label='Widget title'
                required
                placeholder='e.g. Riviera Stay Assistant'
              />
            )}
          />
          <form.AppField
            name='welcomeMessage'
            children={(field) => (
              <field.TextareaField
                label={`Welcome message (${LANGUAGE_LABEL[defaultLanguage] ?? 'default language'})`}
                required
                rows={3}
                maxLength={1000}
                showCount
                placeholder='Hi! How can I help you today?'
              />
            )}
          />
        </FieldGroup>
      )}

      {submitError && (
        <p role='alert' className='text-destructive text-sm'>
          {submitError}
        </p>
      )}

      <div className='flex items-center justify-between gap-3 pt-2'>
        <Button
          type='button'
          variant='ghost'
          disabled={isFirstStep}
          onClick={() => handleCancelOrBack({ onBack: () => setSubmitError(null) })}
        >
          <Icons.chevronLeft className='size-4' aria-hidden='true' />
          Back
        </Button>
        {step.isCompleted ? (
          <form.AppForm>
            <form.SubmitButton>Finish setup</form.SubmitButton>
          </form.AppForm>
        ) : (
          <Button type='submit'>
            Next
            <Icons.chevronRight className='size-4' aria-hidden='true' />
          </Button>
        )}
      </div>
    </form>
  );
}
