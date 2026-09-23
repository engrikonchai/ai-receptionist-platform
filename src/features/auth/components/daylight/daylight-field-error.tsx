'use client';

import { useMemo } from 'react';

/**
 * Same de-duplication/multi-error logic as the shared `FieldError`
 * (src/components/ui/field.tsx), rebuilt with Daylight colors so it
 * never imports a shadcn `text-destructive` class.
 */
export function DaylightFieldError({
  id,
  errors
}: {
  id: string;
  errors?: Array<{ message?: string } | undefined>;
}) {
  const content = useMemo(() => {
    if (!errors?.length) return null;
    const unique = [...new Map(errors.map((error) => [error?.message, error])).values()];
    if (unique.length === 1) return unique[0]?.message;
    return (
      <ul className='ml-4 flex list-disc flex-col gap-1'>
        {unique.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [errors]);

  if (!content) return null;

  return (
    <div id={id} role='alert' className='text-daylight-danger text-sm font-medium'>
      {content}
    </div>
  );
}
