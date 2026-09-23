import React from 'react';
import { Heading } from '../ui/heading';
import type { InfobarContent } from '@/components/ui/infobar';

function PageSkeleton() {
  return (
    <div
      role='status'
      aria-label='Loading page'
      className='flex flex-1 animate-pulse flex-col gap-4 p-4 md:px-6'
    >
      <div className='flex items-center justify-between'>
        <div>
          <div className='bg-muted mb-2 h-8 w-48 rounded' />
          <div className='bg-muted h-4 w-96 rounded' />
        </div>
      </div>
      <div className='bg-muted mt-6 h-40 w-full rounded-lg' />
      <div className='bg-muted h-40 w-full rounded-lg' />
    </div>
  );
}

export default function PageContainer({
  children,
  isLoading = false,
  access = true,
  accessFallback,
  pageTitle,
  pageDescription,
  infoContent,
  pageHeaderAction
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  access?: boolean;
  accessFallback?: React.ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  infoContent?: InfobarContent;
  pageHeaderAction?: React.ReactNode;
}) {
  if (!access) {
    return (
      <div role='status' className='flex flex-1 items-center justify-center p-4 md:px-6'>
        {accessFallback ?? (
          <div className='text-muted-foreground text-center text-lg'>
            You do not have access to this page.
          </div>
        )}
      </div>
    );
  }

  const content = isLoading ? <PageSkeleton /> : children;

  const hasHeader = pageTitle || pageHeaderAction;

  return (
    // Shell anatomy: "Canvas — #EFF1FA, 28px padding, 16px gutters." The
    // 28px step only applies from md+ — at 390px a full 28px gutter on
    // both sides would meaningfully narrow already-dense page content
    // (tables, forms) that this milestone does not redesign, so mobile
    // keeps a slightly tighter, still-breathing 20px.
    <div className='flex flex-1 flex-col px-5 pt-4 pb-6 md:px-7 md:pt-7 md:pb-8'>
      {hasHeader && (
        <div className='mb-5 flex items-start justify-between gap-4'>
          <Heading
            title={pageTitle ?? ''}
            description={pageDescription ?? ''}
            infoContent={infoContent}
          />
          {pageHeaderAction && <div className='shrink-0'>{pageHeaderAction}</div>}
        </div>
      )}
      {content}
    </div>
  );
}
