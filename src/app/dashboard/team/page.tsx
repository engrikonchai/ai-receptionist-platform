import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { loadOwnerContext } from '@/lib/supabase/owner-context';

function initialsFor(name: string) {
  return name
    .split(/[\s@.]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function TeamPage() {
  const ctx = await loadOwnerContext();
  const name = ctx.status === 'ok' ? ctx.profile.display_name?.trim() || null : null;
  const email = ctx.status === 'ok' ? (ctx.user.email ?? '') : '';
  const label = name ?? email ?? 'Owner';

  return (
    <PageContainer
      pageTitle='Team'
      pageDescription='The people who can sign in and manage this business.'
    >
      <div className='flex flex-col gap-8'>
        <section aria-labelledby='team-members'>
          <h2
            id='team-members'
            className='text-muted-foreground mb-3 text-[11px] font-extrabold tracking-[0.12em] uppercase'
          >
            Members
          </h2>
          <ul className='bg-card ring-foreground/10 rounded-2xl p-2 ring-1'>
            <li className='flex items-center gap-3 rounded-xl px-3 py-3'>
              <span
                aria-hidden='true'
                className='bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold'
              >
                {initialsFor(label) || <Icons.user className='size-4' />}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block truncate text-sm font-bold'>{label}</span>
                {name && email && (
                  <span className='text-muted-foreground block truncate text-[13px]'>{email}</span>
                )}
              </span>
              <StatusPill tone='info'>Owner</StatusPill>
            </li>
          </ul>
        </section>

        <section
          aria-labelledby='team-invite'
          className='border-border flex flex-col gap-4 rounded-2xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between'
        >
          <div className='flex items-start gap-4'>
            <span className='bg-secondary text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl'>
              <Icons.teams className='size-5' aria-hidden='true' />
            </span>
            <div>
              <h2 id='team-invite' className='text-foreground text-base font-bold'>
                Invite teammates
              </h2>
              <p className='text-muted-foreground mt-1 max-w-md text-sm leading-relaxed'>
                Inviting teammates isn’t available yet. For now, each business is managed by a
                single owner account.
              </p>
            </div>
          </div>
          <Button type='button' variant='outline' disabled className='shrink-0 self-start'>
            Invite teammate
          </Button>
        </section>
      </div>
    </PageContainer>
  );
}
