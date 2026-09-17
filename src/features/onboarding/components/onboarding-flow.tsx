'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { revalidateLogic, useStore } from '@tanstack/react-form';
import * as z from 'zod';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { FieldGroup } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { useAppForm } from '@/lib/form';
import { useFormStepper } from '@/hooks/use-stepper';
import { normalizeOrigin } from '@/lib/public-widget/origin';
import { describeInvalidOrigin } from '@/features/widget/schemas/widget';
import { InstallSnippetCard } from '@/features/widget/components/install-snippet-card';
import {
  saveWidgetSettingsMutation,
  confirmWidgetInstallationMutation
} from '@/features/widget/api/queries';
import { saveBusinessInfoStepMutation, markOnboardingCompletedMutation } from '../api/queries';
import {
  BUSINESS_TYPE_OPTIONS,
  LANGUAGE_LABEL,
  LANGUAGE_OPTIONS,
  businessInfoStepSchema,
  websiteConnectionStepSchema,
  widgetAppearanceStepSchema,
  type BusinessType,
  type LanguageCode,
  type WidgetPositionValue
} from '../schemas/onboarding';
import {
  MINIMUM_KNOWLEDGE_ITEMS,
  ONBOARDING_STEP,
  type OnboardingStepNumber
} from '../utils/setup-progress';
import { OnboardingKnowledgeStep } from './onboarding-knowledge-step';

export type OnboardingDefaults = {
  businessName: string;
  businessType: BusinessType;
  location: string;
  websiteUrl: string;
  defaultLanguage: LanguageCode;
  supportedLanguages: LanguageCode[];
  assistantName: string;
  welcomeMessage: string;
  primaryColor: string;
  position: WidgetPositionValue;
  humanHandoffEnabled: boolean;
  handoffEmail: string;
  allowedOrigins: string[];
};

const POSITION_OPTIONS = [
  { value: 'bottom-right' as const, label: 'Bottom right' },
  { value: 'bottom-left' as const, label: 'Bottom left' }
];

const STEP_TITLES: Record<OnboardingStepNumber, string> = {
  [ONBOARDING_STEP.business]: 'Your business',
  [ONBOARDING_STEP.knowledge]: 'Initial knowledge',
  [ONBOARDING_STEP.widgetAppearance]: 'Widget appearance',
  [ONBOARDING_STEP.websiteConnection]: 'Website connection',
  [ONBOARDING_STEP.completion]: "You're all set"
};

const STEP_DESCRIPTIONS: Record<OnboardingStepNumber, string> = {
  [ONBOARDING_STEP.business]: 'Tell us the basics — you can change these later in Settings.',
  [ONBOARDING_STEP.knowledge]: 'Give the AI receptionist a few common questions to answer from.',
  [ONBOARDING_STEP.widgetAppearance]: 'What your chat widget looks like and says first.',
  [ONBOARDING_STEP.websiteConnection]: 'Where the widget is allowed to appear.',
  [ONBOARDING_STEP.completion]: 'Your AI receptionist is ready.'
};

// No form fields of their own — Knowledge (step 2) is gated by real
// knowledge_items state via OnboardingKnowledgeStep, and Completion
// (step 5) has nothing left to validate.
const noFieldStepSchema = z.object({});

const STEP_SCHEMAS = [
  businessInfoStepSchema,
  noFieldStepSchema,
  widgetAppearanceStepSchema,
  websiteConnectionStepSchema,
  noFieldStepSchema
];

export function OnboardingFlow({
  businessId,
  publicWidgetId,
  siteOrigin,
  installationConfirmedAt,
  defaultValues,
  initialStep
}: {
  businessId: string;
  publicWidgetId: string;
  siteOrigin: string;
  installationConfirmedAt: string | null;
  defaultValues: OnboardingDefaults;
  initialStep: OnboardingStepNumber;
}) {
  const router = useRouter();
  const [stepError, setStepError] = useState<string | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [confirmSkipKnowledge, setConfirmSkipKnowledge] = useState(false);

  const { step, currentStep, triggerFormGroup, currentValidator } = useFormStepper(STEP_SCHEMAS, {
    initialStep
  });

  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: {
      // Each step's own schema only covers that step's fields, not the
      // whole OnboardingDefaults shape TanStack Form's StandardSchemaV1
      // typing expects for `onDynamic` here — unlike the old
      // single-combined-schema version of this flow, which validated
      // against one schema covering every field. Safe at runtime
      // regardless (a Zod schema's safeParse accepts unknown input and
      // just validates/strips to its own known keys), so this escape
      // hatch only relaxes the compile-time check, not the actual
      // per-step validation `triggerFormGroup()` performs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above; StandardSchemaV1's generic can't express "a schema for a subset of these fields"
      onDynamic: currentValidator as any,
      onDynamicAsyncDebounceMs: 500
    }
  });

  const defaultLanguage = useStore(form.store, (s) => s.values.defaultLanguage);
  const allowedOrigins = useStore(form.store, (s) => s.values.allowedOrigins);

  const saveBusinessInfoMutation = useMutation(saveBusinessInfoStepMutation(businessId));
  const saveWidgetMutation = useMutation(saveWidgetSettingsMutation(businessId, defaultLanguage));
  const confirmInstallMutation = useMutation(confirmWidgetInstallationMutation(businessId));
  const markCompleteMutation = useMutation(markOnboardingCompletedMutation(businessId));

  const typedStep = currentStep as OnboardingStepNumber;

  // Reached Completion (whether by finishing step 4, or by resuming
  // directly here) — idempotent, safe to call every time this step
  // mounts, including a re-visit.
  useEffect(() => {
    if (typedStep === ONBOARDING_STEP.completion) {
      markCompleteMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per step-5 mount, not on every mutation-object identity change
  }, [typedStep]);

  async function handleBusinessInfoNext() {
    setStepError(null);
    const validation = await triggerFormGroup(form);
    if (!validation.success) return;

    const result = await saveBusinessInfoMutation.mutateAsync(form.state.values);
    if (!result.success) {
      setStepError(result.error);
      return;
    }

    // Convenience prefill only — never persisted itself (see
    // schemas/onboarding.ts). Only applies once, and only if the owner
    // hasn't already added an origin some other way.
    const websiteUrl = form.state.values.websiteUrl.trim();
    if (websiteUrl && form.state.values.allowedOrigins.length === 0) {
      const normalized = normalizeOrigin(websiteUrl);
      if (normalized) form.setFieldValue('allowedOrigins', [normalized]);
    }

    step.goToNextStep();
  }

  function handleKnowledgeSkip() {
    if (!confirmSkipKnowledge) {
      setConfirmSkipKnowledge(true);
      return;
    }
    setConfirmSkipKnowledge(false);
    step.goToNextStep();
  }

  function handleKnowledgeContinue() {
    setConfirmSkipKnowledge(false);
    step.goToNextStep();
  }

  async function handleWidgetAppearanceNext() {
    setStepError(null);
    const validation = await triggerFormGroup(form);
    if (!validation.success) return;
    step.goToNextStep();
  }

  async function saveWidgetAndAdvance() {
    setStepError(null);
    const validation = await triggerFormGroup(form);
    if (!validation.success) return;

    const values = form.state.values;
    const welcomeMessageField =
      values.defaultLanguage === 'me'
        ? 'welcomeMessageMe'
        : values.defaultLanguage === 'ru'
          ? 'welcomeMessageRu'
          : 'welcomeMessageEn';

    const result = await saveWidgetMutation.mutateAsync({
      enabled: true,
      assistantName: values.assistantName,
      welcomeMessageEn: welcomeMessageField === 'welcomeMessageEn' ? values.welcomeMessage : '',
      welcomeMessageMe: welcomeMessageField === 'welcomeMessageMe' ? values.welcomeMessage : '',
      welcomeMessageRu: welcomeMessageField === 'welcomeMessageRu' ? values.welcomeMessage : '',
      primaryColor: values.primaryColor,
      position: values.position,
      supportedLanguages: values.supportedLanguages,
      humanHandoffEnabled: values.humanHandoffEnabled,
      handoffEmail: values.handoffEmail,
      allowedOrigins: values.allowedOrigins
    });

    if (!result.success) {
      setStepError(result.error);
      return;
    }
    step.goToNextStep();
  }

  const totalSteps = STEP_SCHEMAS.length;

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='text-muted-foreground text-sm'>
            Step {typedStep} of {totalSteps}
          </span>
          <span className='text-muted-foreground text-sm'>{STEP_TITLES[typedStep]}</span>
        </div>
        <Progress value={(typedStep / totalSteps) * 100} aria-label='Onboarding progress' />
      </div>

      <div className='space-y-1'>
        <h1 className='text-foreground text-xl font-semibold'>{STEP_TITLES[typedStep]}</h1>
        <p className='text-muted-foreground text-sm'>{STEP_DESCRIPTIONS[typedStep]}</p>
      </div>

      {typedStep === ONBOARDING_STEP.business && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleBusinessInfoNext();
          }}
          className='space-y-6'
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
              name='websiteUrl'
              children={(field) => (
                <field.TextField
                  label='Website URL'
                  type='url'
                  placeholder='https://example.com'
                  description='Optional — we use this to suggest an allowed origin later.'
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
          </FieldGroup>

          {stepError && (
            <p role='alert' className='text-destructive text-sm'>
              {stepError}
            </p>
          )}

          <div className='flex items-center justify-end gap-3 pt-2'>
            <Button
              type='submit'
              disabled={saveBusinessInfoMutation.isPending}
              className='h-11 sm:h-9'
            >
              {saveBusinessInfoMutation.isPending ? 'Saving…' : 'Continue'}
              <Icons.chevronRight className='size-4' aria-hidden='true' />
            </Button>
          </div>
        </form>
      )}

      {typedStep === ONBOARDING_STEP.knowledge && (
        <div className='space-y-6'>
          <OnboardingKnowledgeStep
            businessId={businessId}
            defaultLanguage={defaultLanguage}
            onCountChange={setKnowledgeCount}
          />

          {confirmSkipKnowledge && (
            <div className='border-destructive/30 bg-destructive/10 rounded-lg border p-3'>
              <p className='text-foreground text-sm font-medium'>Skip adding knowledge for now?</p>
              <p className='text-muted-foreground mt-1 text-sm'>
                Without any answers, the AI receptionist won&apos;t be able to help visitors yet.
                You can add these any time from Knowledge in the dashboard.
              </p>
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button type='button' size='sm' variant='outline' onClick={handleKnowledgeSkip}>
                  Yes, skip for now
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={() => setConfirmSkipKnowledge(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className='flex flex-wrap items-center justify-between gap-3 pt-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => step.goToPrevStep()}
              className='h-11 sm:h-9'
            >
              <Icons.chevronLeft className='size-4' aria-hidden='true' />
              Back
            </Button>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={handleKnowledgeSkip}
                className='h-11 sm:h-9'
              >
                Skip for now
              </Button>
              <Button
                type='button'
                onClick={handleKnowledgeContinue}
                disabled={knowledgeCount < MINIMUM_KNOWLEDGE_ITEMS}
                className='h-11 sm:h-9'
              >
                Continue
                <Icons.chevronRight className='size-4' aria-hidden='true' />
              </Button>
            </div>
          </div>
        </div>
      )}

      {typedStep === ONBOARDING_STEP.widgetAppearance && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleWidgetAppearanceNext();
          }}
          className='space-y-6'
        >
          <FieldGroup>
            <form.AppField
              name='assistantName'
              children={(field) => (
                <field.TextField
                  label='Assistant display name'
                  required
                  placeholder='e.g. Adria Assistant'
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
            <form.AppField
              name='primaryColor'
              children={(field) => (
                <field.ColorField
                  label='Primary brand colour'
                  description='Used for the launcher button and header.'
                />
              )}
            />
            <form.AppField
              name='position'
              children={(field) => (
                <field.RadioGroupField label='Launcher position' options={POSITION_OPTIONS} />
              )}
            />
            <form.AppField
              name='humanHandoffEnabled'
              children={(field) => (
                <field.SwitchField
                  label='Allow human hand-off'
                  description='Lets visitors ask to speak with a person instead of the AI.'
                />
              )}
            />
            <form.AppField
              name='handoffEmail'
              children={(field) => (
                <field.TextField
                  label='Handoff contact email'
                  type='email'
                  placeholder='you@yourbusiness.com'
                  description='Where hand-off requests are sent. Required if human hand-off is on.'
                />
              )}
            />
          </FieldGroup>

          {stepError && (
            <p role='alert' className='text-destructive text-sm'>
              {stepError}
            </p>
          )}

          <div className='flex items-center justify-between gap-3 pt-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => step.goToPrevStep()}
              className='h-11 sm:h-9'
            >
              <Icons.chevronLeft className='size-4' aria-hidden='true' />
              Back
            </Button>
            <Button type='submit' className='h-11 sm:h-9'>
              Continue
              <Icons.chevronRight className='size-4' aria-hidden='true' />
            </Button>
          </div>
        </form>
      )}

      {typedStep === ONBOARDING_STEP.websiteConnection && (
        <div className='space-y-6'>
          <FieldGroup>
            <form.AppField
              name='allowedOrigins'
              mode='array'
              children={(field) => (
                <field.TagsField
                  label='Website origins that may embed this widget'
                  placeholder='https://example.com'
                  validate={describeInvalidOrigin}
                  description='Include https:// and no path — e.g. https://example.com, not https://example.com/about.'
                />
              )}
            />
          </FieldGroup>

          <InstallSnippetCard
            siteOrigin={siteOrigin}
            publicWidgetId={publicWidgetId}
            installationConfirmedAt={installationConfirmedAt}
            onConfirmInstall={() => confirmInstallMutation.mutate()}
            isConfirming={confirmInstallMutation.isPending}
          />

          {stepError && (
            <p role='alert' className='text-destructive text-sm'>
              {stepError}
            </p>
          )}

          <div className='flex flex-wrap items-center justify-between gap-3 pt-2'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => step.goToPrevStep()}
              className='h-11 sm:h-9'
            >
              <Icons.chevronLeft className='size-4' aria-hidden='true' />
              Back
            </Button>
            <div className='flex flex-wrap gap-2'>
              {allowedOrigins.length === 0 && (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => void saveWidgetAndAdvance()}
                  disabled={saveWidgetMutation.isPending}
                  className='h-11 sm:h-9'
                >
                  Skip for now
                </Button>
              )}
              {allowedOrigins.length > 0 && (
                <Button
                  type='button'
                  onClick={() => void saveWidgetAndAdvance()}
                  disabled={saveWidgetMutation.isPending}
                  className='h-11 sm:h-9'
                >
                  {saveWidgetMutation.isPending ? 'Saving…' : 'Continue'}
                  <Icons.chevronRight className='size-4' aria-hidden='true' />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {typedStep === ONBOARDING_STEP.completion && (
        <div className='space-y-6'>
          <Empty className='border-none p-0'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Icons.circleCheck className='text-primary size-6' aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>Your AI receptionist is ready</EmptyTitle>
              <EmptyDescription>
                You can keep refining your knowledge base, widget appearance, and installation any
                time from the dashboard — a setup checklist there will guide you.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>

          <div className='flex justify-end pb-[env(safe-area-inset-bottom)]'>
            <Button
              type='button'
              onClick={async () => {
                // Idempotent — awaiting it again here (even if the
                // effect above already resolved it) guarantees
                // onboarding_completed is actually true server-side
                // before navigating, so dashboard/layout.tsx's own
                // guard never bounces the owner back here.
                await markCompleteMutation.mutateAsync();
                router.push('/dashboard/overview');
              }}
              disabled={markCompleteMutation.isPending}
              className='h-11 w-full sm:h-9 sm:w-auto'
            >
              {markCompleteMutation.isPending ? 'Finishing up…' : 'Go to dashboard'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
