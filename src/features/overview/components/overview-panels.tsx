import Link from 'next/link';
import { Icons } from '@/components/icons';
import { StatusPill } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';
import { formatRelativeShort } from '@/features/inbox/utils/format';
import type { ConversationListItem } from '@/features/inbox/api/types';
import type { LeadListItem } from '@/features/leads/api/types';
import { LEAD_STATUS_LABEL } from '@/features/inbox/utils/format';

/**
 * Overview building blocks. Server-renderable, presentational only —
 * every figure comes from data the Overview page already loaded through
 * the existing Inbox/Leads services (see app/dashboard/overview/page.tsx).
 */

export function Panel({
  title,
  description,
  action,
  children,
  className
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('bg-card ring-foreground/10 flex flex-col rounded-2xl ring-1', className)}
    >
      <header className='flex items-start justify-between gap-3 px-5 pt-5 pb-3'>
        <div className='min-w-0'>
          <h2 className='text-foreground text-[15px] leading-tight font-extrabold'>{title}</h2>
          {description && <p className='text-muted-foreground mt-0.5 text-[13px]'>{description}</p>}
        </div>
        {action}
      </header>
      <div className='flex-1 px-2 pb-2'>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className='text-accent-foreground hover:bg-accent focus-visible:ring-ring -mr-2 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none'
    >
      {children}
      <Icons.arrowRight className='size-3.5' aria-hidden='true' />
    </Link>
  );
}

function PanelEmpty({
  icon: Icon,
  title,
  children
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col items-center gap-2 px-6 py-8 text-center'>
      <span className='bg-status-success-soft text-status-success flex size-10 items-center justify-center rounded-full'>
        <Icon className='size-5' aria-hidden='true' />
      </span>
      <p className='text-foreground text-sm font-bold'>{title}</p>
      <p className='text-muted-foreground max-w-xs text-[13px] leading-relaxed'>{children}</p>
    </div>
  );
}

function initialsFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Conversations where a visitor asked for a person and nobody has picked it up yet. */
export function AttentionQueue({ items, total }: { items: ConversationListItem[]; total: number }) {
  return (
    <Panel
      title='Needs your attention'
      description={
        total > 0
          ? `${total} conversation${total === 1 ? '' : 's'} waiting for a person`
          : 'Nothing is waiting on you'
      }
      action={<PanelLink href='/dashboard/inbox'>Open Inbox</PanelLink>}
    >
      {items.length === 0 ? (
        <PanelEmpty icon={Icons.circleCheck} title='You’re all caught up'>
          When a visitor asks for a person, the conversation shows up here first.
        </PanelEmpty>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/inbox?conversation=${c.id}`}
                className='hover:bg-muted/70 focus-visible:ring-ring relative flex touch-manipulation items-start gap-3 rounded-xl px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none'
              >
                <span
                  aria-hidden='true'
                  className='bg-status-attention-soft text-status-attention flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold'
                >
                  {c.hasLeadName ? initialsFor(c.displayName) : <Icons.user className='size-4' />}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='flex items-baseline justify-between gap-2'>
                    <span className='text-foreground truncate text-sm font-bold'>
                      {c.displayName}
                    </span>
                    <time
                      dateTime={c.latestMessageAt ?? c.updatedAt}
                      suppressHydrationWarning
                      className='text-status-attention shrink-0 text-xs font-bold tabular-nums'
                    >
                      {formatRelativeShort(c.latestMessageAt ?? c.updatedAt)}
                    </time>
                  </span>
                  <span className='text-muted-foreground mt-0.5 line-clamp-2 block text-[13px] leading-snug'>
                    {c.latestMessagePreview ?? 'No messages yet'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function NewLeadsPanel({ leads, total }: { leads: LeadListItem[]; total: number }) {
  return (
    <Panel
      title='New leads'
      description={total > 0 ? `${total} to follow up` : 'No leads waiting'}
      action={<PanelLink href='/dashboard/leads'>All leads</PanelLink>}
    >
      {leads.length === 0 ? (
        <PanelEmpty icon={Icons.leads} title='No new leads'>
          When a visitor shares their details, they appear here so you can follow up.
        </PanelEmpty>
      ) : (
        <ul>
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href='/dashboard/leads'
                className='hover:bg-muted/70 focus-visible:ring-ring flex touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none'
              >
                <span
                  aria-hidden='true'
                  className='bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold'
                >
                  {initialsFor(lead.displayName)}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='text-foreground block truncate text-sm font-bold'>
                    {lead.displayName}
                  </span>
                  <span className='text-muted-foreground block truncate text-[13px]'>
                    {lead.maskedContact}
                  </span>
                </span>
                <span className='flex shrink-0 flex-col items-end gap-1'>
                  <StatusPill tone='attention'>{LEAD_STATUS_LABEL[lead.status]}</StatusPill>
                  <time
                    dateTime={lead.createdAt}
                    suppressHydrationWarning
                    className='text-muted-foreground text-xs tabular-nums'
                  >
                    {formatRelativeShort(lead.createdAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export type ActivityDay = { label: string; count: number; isToday: boolean };

export function ActivityPanel({
  days,
  conversationCount,
  assistantOnlyPercent,
  leadCount,
  handoffCount
}: {
  days: ActivityDay[];
  conversationCount: number;
  assistantOnlyPercent: number | null;
  leadCount: number;
  handoffCount: number;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const stats = [
    { label: 'Conversations', value: String(conversationCount) },
    {
      label: 'Handled by the assistant alone',
      value: assistantOnlyPercent === null ? '—' : `${assistantOnlyPercent}%`
    },
    { label: 'Leads captured', value: String(leadCount) },
    { label: 'Handed to a person', value: String(handoffCount) }
  ];

  return (
    <Panel
      title='Last 7 days'
      description='Based on your most recent conversations'
      className='lg:col-span-2'
    >
      <div className='grid gap-6 px-3 pt-1 pb-3 sm:grid-cols-[1fr_1.15fr] sm:items-end'>
        <dl className='grid grid-cols-2 gap-x-4 gap-y-4'>
          {stats.map((s) => (
            <div key={s.label}>
              <dd className='font-display text-foreground text-[32px] leading-none font-semibold tabular-nums'>
                {s.value}
              </dd>
              <dt className='text-muted-foreground mt-1.5 text-[12px] leading-snug font-semibold'>
                {s.label}
              </dt>
            </div>
          ))}
        </dl>

        <figure aria-label='Conversations per day, last 7 days'>
          <div className='flex h-28 items-end gap-2' aria-hidden='true'>
            {days.map((d) => (
              <div
                key={d.label}
                className='flex h-full flex-1 flex-col items-center justify-end gap-1.5'
              >
                <span className='text-muted-foreground text-[11px] font-bold tabular-nums'>
                  {d.count > 0 ? d.count : ''}
                </span>
                <span
                  className={cn(
                    'w-full rounded-t-md',
                    d.isToday ? 'bg-primary' : 'bg-primary/35',
                    d.count === 0 && 'bg-border'
                  )}
                  style={{ height: `${Math.max(6, (d.count / max) * 72)}px` }}
                />
              </div>
            ))}
          </div>
          <div className='mt-1.5 flex gap-2' aria-hidden='true'>
            {days.map((d) => (
              <span
                key={d.label}
                className={cn(
                  'flex-1 text-center text-[11px] font-semibold',
                  d.isToday ? 'text-foreground font-extrabold' : 'text-muted-foreground'
                )}
              >
                {d.label}
              </span>
            ))}
          </div>
          <figcaption className='sr-only'>
            {days.map((d) => `${d.label}: ${d.count}`).join(', ')}
          </figcaption>
        </figure>
      </div>
    </Panel>
  );
}

export function AssistantPanel({
  widgetEnabled,
  installed,
  activeKnowledgeCount
}: {
  widgetEnabled: boolean;
  installed: boolean;
  activeKnowledgeCount: number;
}) {
  const rows = [
    {
      href: '/dashboard/widget',
      icon: Icons.code,
      label: 'Website widget',
      status: widgetEnabled ? (
        <StatusPill tone='success' dot>
          Live
        </StatusPill>
      ) : (
        <StatusPill tone='attention'>Off</StatusPill>
      ),
      hint: installed ? 'Installed and tested' : 'Not confirmed on your site yet'
    },
    {
      href: '/dashboard/knowledge',
      icon: Icons.knowledge,
      label: 'Knowledge',
      status: (
        <StatusPill tone={activeKnowledgeCount > 0 ? 'success' : 'attention'}>
          {activeKnowledgeCount} active
        </StatusPill>
      ),
      hint:
        activeKnowledgeCount > 0 ? 'Answers your assistant can use' : 'Add answers to get started'
    },
    {
      href: '/dashboard/agent',
      icon: Icons.aiAgent,
      label: 'Tone & style',
      status: null,
      hint: 'How the assistant sounds'
    }
  ];
  return (
    <Panel title='Your assistant'>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <Link
              href={row.href}
              className='hover:bg-muted/70 focus-visible:ring-ring flex touch-manipulation items-center gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none'
            >
              <span className='bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <row.icon className='size-[18px]' aria-hidden='true' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='text-foreground block text-sm font-bold'>{row.label}</span>
                <span className='text-muted-foreground block truncate text-[13px]'>{row.hint}</span>
              </span>
              {row.status}
              <Icons.chevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
