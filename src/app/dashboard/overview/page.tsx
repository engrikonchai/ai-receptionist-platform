import Link from 'next/link';
import { cookies } from 'next/headers';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';

export default async function OverviewPage() {
  const ctx = await loadOwnerContext();

  // dashboard/layout.tsx already enforces auth + onboarding-completed +
  // profile/business presence for every /dashboard/* route before this
  // page ever renders, so `ctx.status` is always 'ok' here in practice.
  // This fallback only guards against that invariant somehow not
  // holding, without inventing a redirect loop of its own.
  if (ctx.status !== 'ok') {
    return (
      <PlaceholderPage
        title='Overview'
        description='A snapshot of your AI receptionist activity.'
      />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );
  const activeBusiness = ctx.businesses.find((b) => b.id === activeBusinessId) ?? null;

  const displayName = ctx.profile.display_name?.trim() || ctx.user.email || 'there';

  return (
    <PageContainer
      pageTitle={`Welcome, ${displayName}`}
      pageDescription={
        activeBusiness
          ? `You're managing ${activeBusiness.name}.`
          : 'Your AI receptionist workspace.'
      }
    >
      <Card>
        <CardContent className='space-y-4 pt-6'>
          <p className='text-muted-foreground text-sm'>
            This is your AI receptionist workspace — customer conversations, leads and your chat
            widget all show up here as they come in.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button render={<Link href='/dashboard/inbox' aria-label='Go to Inbox' />}>
              <Icons.chat className='size-4' aria-hidden='true' />
              Go to Inbox
            </Button>
            <Button
              variant='outline'
              render={<Link href='/dashboard/knowledge' aria-label='Manage Knowledge' />}
            >
              <Icons.knowledge className='size-4' aria-hidden='true' />
              Manage Knowledge
            </Button>
            <Button
              variant='outline'
              render={<Link href='/dashboard/widget' aria-label='Configure Widget' />}
            >
              <Icons.code className='size-4' aria-hidden='true' />
              Configure Widget
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
