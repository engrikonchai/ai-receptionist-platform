'use client';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useFormContext } from '@/lib/form-context';

/**
 * The Daylight-scoped counterpart to the shared `SubmitButton`
 * (src/components/forms/submit-button.tsx) — same `form.Subscribe`
 * pattern to disable the button and swap in a spinner while
 * `isSubmitting`, preventing an accidental duplicate submission, just
 * with Daylight markup instead of the shadcn `LoadingButton`.
 */
export function DaylightSubmitButton({
  children,
  className,
  ...props
}: React.ComponentProps<'button'>) {
  const form = useFormContext();

  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <button
          type='submit'
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            'bg-daylight-indigo shadow-daylight-button hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-daylight-button text-[15px] font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70',
            className
          )}
          {...props}
        >
          {isSubmitting && <Icons.spinner className='size-4 animate-spin' aria-hidden='true' />}
          {children}
        </button>
      )}
    </form.Subscribe>
  );
}
