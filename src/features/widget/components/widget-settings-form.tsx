'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-form';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup, FieldSeparator, FieldSet, FieldLegend } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { saveWidgetSettingsMutation } from '../api/queries';
import type { WidgetSettings } from '../api/types';
import {
  WIDGET_HANDOFF_EMAIL_MAX_LENGTH,
  WIDGET_NAME_MAX_LENGTH,
  WIDGET_WELCOME_MESSAGE_MAX_LENGTH,
  widgetSettingsSchema
} from '../schemas/widget';
import {
  WIDGET_LANGUAGE_LABEL,
  WIDGET_LANGUAGE_OPTIONS,
  isWidgetLanguage
} from '../utils/language';
import { InstallSnippetCard } from './install-snippet-card';
import { WidgetPreview } from './widget-preview';

const POSITION_OPTIONS = [
  { value: 'bottom-right' as const, label: 'Bottom right' },
  { value: 'bottom-left' as const, label: 'Bottom left' }
];

function welcomeMessageFieldFor(defaultLanguage: string) {
  return isWidgetLanguage(defaultLanguage)
    ? ({ en: 'welcomeMessageEn', me: 'welcomeMessageMe', ru: 'welcomeMessageRu' } as const)[
        defaultLanguage
      ]
    : 'welcomeMessageEn';
}

export function WidgetSettingsForm({
  businessId,
  defaultLanguage,
  settings,
  siteOrigin
}: {
  businessId: string;
  defaultLanguage: string;
  settings: WidgetSettings;
  siteOrigin: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const saveMutation = useMutation(saveWidgetSettingsMutation(businessId, defaultLanguage));

  const form = useAppForm({
    defaultValues: {
      enabled: settings.enabled,
      assistantName: settings.assistantName,
      welcomeMessageEn: settings.welcomeMessageEn,
      welcomeMessageMe: settings.welcomeMessageMe,
      welcomeMessageRu: settings.welcomeMessageRu,
      primaryColor: settings.primaryColor,
      position: settings.position,
      supportedLanguages: settings.supportedLanguages,
      humanHandoffEnabled: settings.humanHandoffEnabled,
      handoffEmail: settings.handoffEmail,
      allowedOrigins: settings.allowedOrigins
    },
    validators: { onSubmit: widgetSettingsSchema(defaultLanguage) },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const result = await saveMutation.mutateAsync(value);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      toast.success('Widget settings saved.');
    }
  });

  const previewValues = useStore(form.store, (state) => ({
    enabled: state.values.enabled,
    assistantName: state.values.assistantName,
    primaryColor: state.values.primaryColor,
    position: state.values.position,
    welcomeMessage:
      state.values[welcomeMessageFieldFor(defaultLanguage)] || state.values.welcomeMessageEn
  }));

  const defaultLanguageLabel = isWidgetLanguage(defaultLanguage)
    ? WIDGET_LANGUAGE_LABEL[defaultLanguage]
    : 'English';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]'
    >
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.AppField
                name='enabled'
                children={(field) => (
                  <field.SwitchField
                    label='Widget enabled'
                    description='When off, the chat button never appears for visitors, on any allowed domain.'
                  />
                )}
              />
              <FieldSeparator />
              <form.AppField
                name='assistantName'
                children={(field) => (
                  <field.TextField
                    label='Assistant display name'
                    required
                    maxLength={WIDGET_NAME_MAX_LENGTH}
                    placeholder='e.g. Adria Assistant'
                  />
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Welcome message</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.AppField
                name='welcomeMessageEn'
                children={(field) => (
                  <field.TextareaField
                    label={`English welcome message${defaultLanguage === 'en' ? ' · Default language' : ''}`}
                    required={defaultLanguage === 'en'}
                    rows={2}
                    maxLength={WIDGET_WELCOME_MESSAGE_MAX_LENGTH}
                    showCount
                    placeholder='How can we help you today?'
                  />
                )}
              />
              <form.AppField
                name='welcomeMessageMe'
                children={(field) => (
                  <field.TextareaField
                    label={`Montenegrin welcome message${defaultLanguage === 'me' ? ' · Default language' : ''}`}
                    required={defaultLanguage === 'me'}
                    rows={2}
                    maxLength={WIDGET_WELCOME_MESSAGE_MAX_LENGTH}
                    showCount
                    placeholder='Optional'
                  />
                )}
              />
              <form.AppField
                name='welcomeMessageRu'
                children={(field) => (
                  <field.TextareaField
                    label={`Russian welcome message${defaultLanguage === 'ru' ? ' · Default language' : ''}`}
                    required={defaultLanguage === 'ru'}
                    rows={2}
                    maxLength={WIDGET_WELCOME_MESSAGE_MAX_LENGTH}
                    showCount
                    placeholder='Optional'
                  />
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
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
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Languages</CardTitle>
          </CardHeader>
          <CardContent>
            <form.AppField
              name='supportedLanguages'
              mode='array'
              children={(field) => (
                <field.CheckboxGroupField
                  label='Supported reply languages'
                  required
                  options={WIDGET_LANGUAGE_OPTIONS}
                  className='sm:grid-cols-3'
                />
              )}
            />
            <p className='text-muted-foreground mt-2 text-xs'>
              The default language, {defaultLanguageLabel}, is always required.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Human contact</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.AppField
                name='humanHandoffEnabled'
                children={(field) => (
                  <field.SwitchField
                    label='Allow human hand-off'
                    description='Lets visitors ask to speak with a person instead of the AI.'
                  />
                )}
              />
              <FieldSeparator />
              <form.AppField
                name='handoffEmail'
                children={(field) => (
                  <field.TextField
                    label='Handoff contact email'
                    type='email'
                    maxLength={WIDGET_HANDOFF_EMAIL_MAX_LENGTH}
                    placeholder='you@yourbusiness.com'
                    description='Where hand-off requests are sent. Required if human hand-off is on.'
                  />
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Allowed website domains</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend variant='label' className='sr-only'>
                Allowed website domains
              </FieldLegend>
              <form.AppField
                name='allowedOrigins'
                mode='array'
                children={(field) => (
                  <field.TagsField
                    label='Domains that may embed this widget'
                    placeholder='example.com'
                  />
                )}
              />
            </FieldSet>
            <p className='text-muted-foreground mt-2 text-xs'>
              The widget only responds to requests from these domains. Add your live website&apos;s
              domain (e.g. <code className='bg-muted rounded px-1 py-0.5'>example.com</code>) before
              installing — with none added, the widget won&apos;t respond anywhere yet.
            </p>
          </CardContent>
        </Card>

        {formError && (
          <p role='alert' className='text-destructive text-sm'>
            {formError}
          </p>
        )}

        <div className='flex justify-end'>
          <form.AppForm>
            <form.SubmitButton>Save changes</form.SubmitButton>
          </form.AppForm>
        </div>
      </div>

      <div className='space-y-6 lg:sticky lg:top-6 lg:self-start'>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <WidgetPreview {...previewValues} />
          </CardContent>
        </Card>

        <InstallSnippetCard siteOrigin={siteOrigin} publicWidgetId={settings.publicWidgetId} />
      </div>
    </form>
  );
}
