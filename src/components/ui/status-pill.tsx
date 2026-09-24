import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The one status chip used across the dashboard. Color always carries
 * meaning (see `--status-*` in src/styles/daylight-dashboard.css) and is
 * never the only signal — every pill has a text label, and an optional
 * icon/dot.
 *
 *  attention — needs the owner now      success — done / healthy
 *  info      — in progress / by the AI  neutral — inactive / closed
 *  danger    — error / destructive
 */
const statusPillVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap',
  {
    variants: {
      tone: {
        attention: 'bg-status-attention-soft text-status-attention',
        success: 'bg-status-success-soft text-status-success',
        info: 'bg-status-info-soft text-status-info',
        neutral: 'bg-status-neutral-soft text-status-neutral',
        danger: 'bg-status-danger-soft text-status-danger'
      }
    },
    defaultVariants: { tone: 'neutral' }
  }
);

export type StatusTone = NonNullable<VariantProps<typeof statusPillVariants>['tone']>;

export function StatusPill({
  tone,
  dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof statusPillVariants> & { dot?: boolean }) {
  return (
    <span
      data-slot='status-pill'
      className={cn(statusPillVariants({ tone }), className)}
      {...props}
    >
      {dot && <span aria-hidden='true' className='size-1.5 rounded-full bg-current' />}
      {children}
    </span>
  );
}
