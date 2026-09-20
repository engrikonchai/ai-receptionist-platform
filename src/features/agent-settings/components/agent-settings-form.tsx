'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, FieldSeparator } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { useAppForm } from '@/lib/form';
import { updateAgentSettingsMutation } from '../api/queries';
import type { AgentSettings } from '../api/types';
import {
  AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH,
  AGENT_RESPONSE_LENGTH_OPTIONS,
  AGENT_TONE_OPTIONS,
  agentSettingsSchema
} from '../schemas/agent-settings';

const TONE_LABEL: Record<(typeof AGENT_TONE_OPTIONS)[number], string> = {
  professional: 'Professional',
  friendly: 'Friendly',
  warm: 'Warm'
};

const RESPONSE_LENGTH_LABEL: Record<(typeof AGENT_RESPONSE_LENGTH_OPTIONS)[number], string> = {
  concise: 'Concise',
  balanced: 'Balanced',
  detailed: 'Detailed'
};

const TONE_RADIO_OPTIONS = AGENT_TONE_OPTIONS.map((value) => ({
  value,
  label: TONE_LABEL[value]
}));

const RESPONSE_LENGTH_RADIO_OPTIONS = AGENT_RESPONSE_LENGTH_OPTIONS.map((value) => ({
  value,
  label: RESPONSE_LENGTH_LABEL[value]
}));

export function AgentSettingsForm({
  businessId,
  settings
}: {
  businessId: string;
  settings: AgentSettings;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation(updateAgentSettingsMutation(businessId));

  const form = useAppForm({
    defaultValues: {
      tone: settings.tone,
      responseLength: settings.responseLength,
      customInstructions: settings.customInstructions ?? ''
    },
    validators: { onSubmit: agentSettingsSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const result = await saveMutation.mutateAsync(value);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      toast.success('Agent settings saved.');
    }
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className='max-w-2xl space-y-6'
    >
      <Alert>
        <Icons.info aria-hidden='true' />
        <AlertTitle>These settings define how the assistant should communicate</AlertTitle>
        <AlertDescription>
          <p>
            Real AI-generated responses are not enabled by this page yet — today&apos;s widget
            replies still come from the existing keyword/knowledge reply engine, unchanged. Tone,
            response length, and custom instructions saved here are stored for a future AI reply
            engine to use.
          </p>
          <p>
            The assistant&apos;s public name and welcome messages are managed under{' '}
            <Link href='/dashboard/widget'>Widget</Link>, along with human hand-off behavior.
            Supported languages live in <Link href='/dashboard/settings'>Business Settings</Link>,
            and what the assistant knows comes from{' '}
            <Link href='/dashboard/knowledge'>Knowledge Base</Link>.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Tone and length</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form.AppField
              name='tone'
              children={(field) => (
                <field.RadioGroupField label='Tone' options={TONE_RADIO_OPTIONS} />
              )}
            />
            <FieldSeparator />
            <form.AppField
              name='responseLength'
              children={(field) => (
                <field.RadioGroupField
                  label='Response length'
                  options={RESPONSE_LENGTH_RADIO_OPTIONS}
                />
              )}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <form.AppField
            name='customInstructions'
            children={(field) => (
              <field.TextareaField
                label='Custom instructions'
                rows={6}
                maxLength={AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH}
                showCount
                placeholder='e.g. Mention that parking must be reserved in advance. Avoid making promises about availability. Keep answers practical and direct.'
                description='Optional. Plain text only — not interpreted as Markdown or HTML.'
              />
            )}
          />
        </CardContent>
      </Card>

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
    </form>
  );
}
