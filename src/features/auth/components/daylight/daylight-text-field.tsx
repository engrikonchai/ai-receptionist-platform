'use client';

import { cn } from '@/lib/utils';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import { DaylightFieldError } from './daylight-field-error';

/**
 * A Daylight-scoped text input for the auth pages only — deliberately
 * not the shared `TextField` (src/components/forms/fields/text-field.tsx),
 * which is used across the whole app including dashboard forms, and
 * whose colors come from the shadcn/zen theme tokens rather than
 * `daylight-*`. Same field-context wiring, own markup — see
 * docs/daylight-design-system.md "Authentication" section.
 *
 * Sizing/border/focus values are from the approved
 * "Design System.dc.html" §06 "Inputs and controls" (48px tall, 12px
 * radius, 1.5px border, focus = indigo border + 3px tint outline).
 */
export function DaylightTextField({
  label,
  description,
  required,
  className,
  ...inputProps
}: BaseFieldProps & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'onBlur'>) {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
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
      <input
        id={field.name}
        name={field.name}
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={isInvalid}
        aria-describedby={cn(descriptionId, isInvalid && errorId).trim() || undefined}
        className={cn(
          'border-daylight-input-border text-daylight-ink placeholder:text-daylight-muted bg-daylight-surface min-h-12 rounded-daylight-control focus-visible:border-daylight-indigo focus-visible:outline-daylight-on-indigo-muted border-1.5 px-4 py-3 text-[15px] outline-none transition-colors focus-visible:outline-3',
          isInvalid && 'border-daylight-danger bg-daylight-danger-tint',
          className
        )}
        {...inputProps}
      />
      {description && (
        <p id={descriptionId} className='text-daylight-muted text-xs'>
          {description}
        </p>
      )}
      {isInvalid && <DaylightFieldError id={errorId} errors={field.state.meta.errors} />}
    </div>
  );
}
