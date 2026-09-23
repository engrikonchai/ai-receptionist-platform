'use client';

import { useState } from 'react';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import { DaylightFieldError } from './daylight-field-error';

/** The Daylight-scoped counterpart to the shared `PasswordField` — see DaylightTextField's doc comment. */
export function DaylightPasswordField({
  label,
  description,
  required,
  className,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur' | 'type'>) {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
  const [visible, setVisible] = useState(false);
  const descriptionId = description ? `${field.name}-description` : undefined;
  const errorId = `${field.name}-error`;

  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={field.name} className='text-daylight-ink text-sm font-semibold'>
        {label}
        {required && (
          <span className='text-daylight-danger' aria-hidden='true'>
            {' '}
            *
          </span>
        )}
      </label>
      <div className='relative'>
        <input
          id={field.name}
          name={field.name}
          type={visible ? 'text' : 'password'}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={isInvalid}
          aria-describedby={cn(descriptionId, isInvalid && errorId).trim() || undefined}
          className={cn(
            'border-daylight-input-border text-daylight-ink placeholder:text-daylight-muted bg-daylight-surface min-h-12 w-full rounded-daylight-control focus-visible:border-daylight-indigo focus-visible:outline-daylight-on-indigo-muted border-1.5 px-4 py-3 pr-12 text-[15px] outline-none transition-colors focus-visible:outline-3',
            isInvalid && 'border-daylight-danger bg-daylight-danger-tint',
            className
          )}
          {...inputProps}
        />
        <button
          type='button'
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className='text-daylight-muted hover:text-daylight-ink-soft focus-visible:outline-daylight-focus absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-daylight-control focus-visible:outline-2 focus-visible:-outline-offset-2'
        >
          {visible ? (
            <Icons.eyeOff className='size-4.5' aria-hidden='true' />
          ) : (
            <Icons.eye className='size-4.5' aria-hidden='true' />
          )}
        </button>
      </div>
      {description && (
        <p id={descriptionId} className='text-daylight-muted text-xs'>
          {description}
        </p>
      )}
      {isInvalid && <DaylightFieldError id={errorId} errors={field.state.meta.errors} />}
    </div>
  );
}
