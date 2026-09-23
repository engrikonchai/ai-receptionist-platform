import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type QuickAction = {
  href: string;
  label: string;
  hint: string;
  icon: (typeof Icons)[keyof typeof Icons];
  primary?: boolean;
};

/**
 * "Quick actions" — Overview content spec: only real destinations
 * already part of existing Overview behavior (Inbox, Knowledge,
 * Widget). Each tile carries a real-data caption already loaded by
 * this page (active knowledge count, widget enabled state) rather than
 * decorative copy. Inbox is the one primary action (Component Rules:
 * "one indigo action per view") — a filled icon badge, not a separate
 * duplicate button, carries that emphasis.
 */
export function QuickActions({
  activeKnowledgeItemCount,
  widgetEnabled
}: {
  activeKnowledgeItemCount: number;
  widgetEnabled: boolean;
}) {
  const actions: QuickAction[] = [
    {
      href: '/dashboard/inbox',
      label: 'Go to Inbox',
      hint: 'Reply to conversations',
      icon: Icons.chat,
      primary: true
    },
    {
      href: '/dashboard/knowledge',
      label: 'Manage Knowledge',
      hint:
        activeKnowledgeItemCount > 0
          ? `${activeKnowledgeItemCount} active ${activeKnowledgeItemCount === 1 ? 'entry' : 'entries'}`
          : 'No active entries yet',
      icon: Icons.knowledge
    },
    {
      href: '/dashboard/widget',
      label: 'Configure Widget',
      hint: widgetEnabled ? 'Widget is live' : 'Widget is not yet enabled',
      icon: Icons.code
    }
  ];

  return (
    <section aria-label='Quick actions'>
      <h3 className='text-foreground mb-3 text-sm font-bold'>Quick actions</h3>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            aria-label={`${action.label} — ${action.hint}`}
            className='focus-visible:outline-ring block min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2'
          >
            <Card
              className={cn(
                'shadow-sm transition-colors hover:bg-muted/40',
                action.primary && 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              <CardContent className='flex min-w-0 items-center gap-3'>
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    action.primary ? 'bg-primary-foreground/15' : 'bg-muted'
                  )}
                >
                  <action.icon className='size-4' aria-hidden='true' />
                </span>
                {/* No `truncate` (which forces nowrap): these captions
                    are short, real, fixed-length strings, so letting
                    them wrap onto a second line at narrow widths is
                    preferable to an unbreakable line dragging the
                    shell's content column wider than the viewport. */}
                <span className='min-w-0'>
                  <span className='block text-sm font-bold'>{action.label}</span>
                  <span
                    className={cn(
                      'block text-xs',
                      action.primary ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    )}
                  >
                    {action.hint}
                  </span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
