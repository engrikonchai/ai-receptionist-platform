import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { formatTimestamp } from '../utils/format';
import type { ConversationMessage } from '../api/types';

function messageLabel(message: ConversationMessage): string {
  if (message.role === 'user') return 'Customer';
  if (message.role === 'system') return 'System';
  return message.senderType === 'human' ? 'Human operator' : 'AI Receptionist';
}

/** Time only — the thread already shows a day divider, so a full date here would repeat it. */
function timeOnly(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function MessageItem({ message }: { message: ConversationMessage }) {
  if (message.role === 'system') {
    return (
      <div className='flex items-center justify-center gap-1.5 py-1' role='status'>
        <Icons.info className='text-muted-foreground size-3.5 shrink-0' aria-hidden='true' />
        <p className='text-muted-foreground text-center text-xs'>
          {message.content}
          <span className='ml-1.5'>· {formatTimestamp(message.createdAt)}</span>
        </p>
      </div>
    );
  }

  const isCustomer = message.role === 'user';
  const isHuman = message.role === 'assistant' && message.senderType === 'human';

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', isCustomer ? 'items-start' : 'items-end')}>
      <div
        className={cn(
          'text-muted-foreground flex items-center gap-1.5 px-1 text-[11px] font-semibold',
          !isCustomer && 'flex-row-reverse'
        )}
      >
        {isCustomer ? (
          <Icons.user className='size-3' aria-hidden='true' />
        ) : isHuman ? (
          <Icons.humanAgent className='size-3' aria-hidden='true' />
        ) : (
          <Icons.aiAgent className='size-3' aria-hidden='true' />
        )}
        <span>{messageLabel(message)}</span>
        <span aria-hidden='true'>·</span>
        <time dateTime={message.createdAt} suppressHydrationWarning className='tabular-nums'>
          {timeOnly(message.createdAt)}
        </time>
      </div>
      <p
        className={cn(
          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap sm:max-w-[75%]',
          isCustomer && 'bg-card text-foreground ring-border rounded-tl-md ring-1',
          !isCustomer && !isHuman && 'bg-accent text-foreground rounded-tr-md',
          isHuman && 'bg-primary text-primary-foreground rounded-tr-md'
        )}
      >
        {message.content}
      </p>
    </div>
  );
}
