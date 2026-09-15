import { Icons } from '@/components/icons';
import { CHANNEL_ICON, CHANNEL_LABEL } from '../utils/format';
import type { ConversationChannel } from '../api/types';

export function ChannelIcon({
  channel,
  className
}: {
  channel: ConversationChannel;
  className?: string;
}) {
  const Icon = Icons[CHANNEL_ICON[channel]];
  return (
    <span className='inline-flex items-center gap-1' title={CHANNEL_LABEL[channel]}>
      <Icon className={className ?? 'text-muted-foreground size-3.5'} aria-hidden='true' />
      <span className='sr-only'>{CHANNEL_LABEL[channel]}</span>
    </span>
  );
}
