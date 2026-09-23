'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { SetupProgress } from '../utils/setup-progress';

/**
 * The persistent setup checklist shown on Dashboard Overview. Purely
 * presentational — every completion fact comes from `progress`, computed
 * server-side by computeSetupProgress() against the ACTIVE business's
 * real data (see app/dashboard/overview/page.tsx), so this component
 * never needs its own data fetching and always follows whichever
 * business is currently active.
 *
 * Collapses to a compact summary once every item is complete, but a
 * chevron always reopens it — never fully hidden, per the task's own
 * "keep a way to reopen it" requirement. Defaults to collapsed only
 * when already complete; an incomplete checklist always starts open so
 * a returning owner sees exactly what's left without an extra click.
 */
export function SetupChecklist({ progress }: { progress: SetupProgress }) {
  const [collapsed, setCollapsed] = useState(progress.isComplete);

  return (
    <Card className='shadow-sm'>
      <CardHeader>
        <button
          type='button'
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className='flex w-full items-center justify-between gap-3 text-left'
        >
          <div className='min-w-0'>
            <CardTitle className='flex items-center gap-2 text-[15px] font-extrabold'>
              {progress.isComplete && (
                <Icons.circleCheck className='text-primary size-4 shrink-0' aria-hidden='true' />
              )}
              Setup checklist
            </CardTitle>
            <p className='text-muted-foreground mt-1 text-sm'>
              {progress.completedCount} of {progress.totalCount} completed
            </p>
          </div>
          <Icons.chevronDown
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              !collapsed && 'rotate-180'
            )}
            aria-hidden='true'
          />
        </button>
        <Progress
          value={(progress.completedCount / progress.totalCount) * 100}
          aria-label='Setup checklist progress'
          className='mt-2'
        />
      </CardHeader>
      {!collapsed && (
        <CardContent>
          <ul className='space-y-2'>
            {progress.items.map((item) => (
              <li key={item.id}>
                {item.completed ? (
                  <div className='flex items-start gap-2.5 py-1.5'>
                    <Icons.circleCheck
                      className='text-primary mt-0.5 size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <div className='min-w-0'>
                      <p className='text-foreground text-sm font-bold'>{item.label}</p>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className='hover:bg-muted/50 focus-visible:outline-ring -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'
                  >
                    <Icons.circle
                      className='text-muted-foreground mt-0.5 size-4 shrink-0'
                      aria-hidden='true'
                    />
                    <div className='min-w-0 flex-1'>
                      <p className='text-foreground text-sm font-bold'>{item.label}</p>
                      <p className='text-muted-foreground text-sm'>{item.description}</p>
                    </div>
                    <Icons.chevronRight
                      className='text-muted-foreground mt-0.5 size-4 shrink-0'
                      aria-hidden='true'
                    />
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {progress.isComplete && (
            <div className='mt-3 flex justify-end'>
              <Button type='button' variant='ghost' size='sm' onClick={() => setCollapsed(true)}>
                Collapse
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
