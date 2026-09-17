'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';

/**
 * Free-text tag list over a `string[]` value. Use with `mode='array'` on the
 * `<form.AppField>` — Enter or the Add button pushes, badges remove.
 */
export function TagsField({
  label,
  description,
  required,
  placeholder = 'Type and press Enter...',
  validate
}: BaseFieldProps & {
  placeholder?: string;
  /** Optional per-tag check, run before a tag is added. Return an error message to reject it (shown inline, tag never gets pushed) or `null`/`undefined` to accept it. */
  validate?: (tag: string) => string | null | undefined;
}) {
  const field = useFieldContext<string[]>();
  const isInvalid = useFieldInvalid();
  const [tagInput, setTagInput] = React.useState('');
  const [addError, setAddError] = React.useState<string | null>(null);
  const values = field.state.value || [];

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (values.includes(tag)) {
      setTagInput('');
      setAddError(null);
      return;
    }
    const error = validate?.(tag);
    if (error) {
      setAddError(error);
      return;
    }
    field.pushValue(tag);
    setTagInput('');
    setAddError(null);
  };

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel>
        {label}
        {required && ' *'}
      </FieldLabel>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value);
            if (addError) setAddError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          aria-label={`Add a ${label.toLowerCase().replace(/ \*$/, '')}`}
          aria-invalid={isInvalid || Boolean(addError)}
          aria-describedby={
            addError ? `${field.name}-add-error` : isInvalid ? `${field.name}-error` : undefined
          }
          className='min-w-0 flex-1'
        />
        <Button
          type='button'
          variant='secondary'
          onClick={addTag}
          className='h-11 w-full shrink-0 sm:h-9 sm:w-auto'
        >
          Add
        </Button>
      </div>
      {addError && (
        <p id={`${field.name}-add-error`} role='alert' className='text-destructive text-sm'>
          {addError}
        </p>
      )}
      {values.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {values.map((tag, idx) => (
            <Badge
              key={tag}
              variant='secondary'
              className='h-auto max-w-full gap-1 py-1.5 pr-1.5 whitespace-normal'
            >
              <span className='break-all'>{tag}</span>
              <button
                type='button'
                onClick={() => field.removeValue(idx)}
                aria-label={`Remove ${tag}`}
                className='hover:text-destructive -m-1.5 flex size-8 shrink-0 items-center justify-center'
              >
                <Icons.close className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {description && <FieldDescription>{description}</FieldDescription>}
      {isInvalid && <FieldError id={`${field.name}-error`} errors={field.state.meta.errors} />}
    </Field>
  );
}
