'use client';

import * as React from 'react';
import { useState } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group';
import { Icons } from '@/components/icons';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';

/** A password `TextField` with a show/hide toggle — never a plain `type='text'` input by default. */
export function PasswordField({
  label,
  description,
  required,
  ...inputProps
}: BaseFieldProps &
  Omit<React.ComponentProps<typeof InputGroupInput>, 'value' | 'onChange' | 'onBlur' | 'type'>) {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
  const [visible, setVisible] = useState(false);

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>
        {label}
        {required && ' *'}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={field.name}
          name={field.name}
          type={visible ? 'text' : 'password'}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={isInvalid}
          aria-describedby={isInvalid ? `${field.name}-error` : undefined}
          {...inputProps}
        />
        <InputGroupAddon align='inline-end'>
          <InputGroupButton
            type='button'
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? (
              <Icons.eyeOff className='size-4' aria-hidden='true' />
            ) : (
              <Icons.eye className='size-4' aria-hidden='true' />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
      {isInvalid && <FieldError id={`${field.name}-error`} errors={field.state.meta.errors} />}
    </Field>
  );
}
