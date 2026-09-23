'use client';

import { forwardRef } from 'react';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

const VARIANT_STYLES = {
  error: {
    role: 'alert' as const,
    icon: Icons.warning,
    className: 'bg-daylight-danger-tint text-daylight-danger'
  },
  success: {
    role: 'status' as const,
    icon: Icons.circleCheck,
    className: 'bg-daylight-success-tint text-daylight-success'
  },
  info: {
    role: 'status' as const,
    icon: Icons.info,
    className: 'bg-daylight-indigo-tint text-daylight-ink-soft'
  }
};

/**
 * A single, focusable banner component for every non-field-level
 * message an auth form shows — server error, success confirmation, or
 * an informational notice (e.g. "check your email"). Forwards its ref
 * so a form can move keyboard focus onto it after a submission fails,
 * per this milestone's "focus must move sensibly after errors"
 * requirement, without stealing focus from a page that hasn't been
 * submitted yet.
 */
export const DaylightFormMessage = forwardRef<
  HTMLDivElement,
  {
    variant: 'error' | 'success' | 'info';
    children: React.ReactNode;
  }
>(function DaylightFormMessage({ variant, children }, ref) {
  const { role, icon: Icon, className } = VARIANT_STYLES[variant];

  return (
    <div
      ref={ref}
      role={role}
      tabIndex={-1}
      className={cn(
        'flex items-start gap-2.5 rounded-daylight-control px-4 py-3 text-sm leading-relaxed outline-none',
        className
      )}
    >
      <Icon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <div>{children}</div>
    </div>
  );
});
