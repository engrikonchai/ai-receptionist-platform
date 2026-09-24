import { Icons } from '@/components/icons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  ATTENTION_LABEL,
  conversationAttention,
  handoffStatusIndicatorLabel,
  type ConversationAttention
} from '../utils/format';
import type { ConversationListItem, ConversationStatus, HandoffStatus } from '../api/types';

const ATTENTION_TONE: Record<ConversationAttention, StatusTone> = {
  needs_you: 'attention',
  with_you: 'info',
  ai: 'neutral',
  closed: 'neutral'
};

/**
 * The single, primary state of a conversation — what the owner should
 * do about it. Replaces the old trio of overlapping badges (status,
 * who-replies, handoff) everywhere a quick scan matters.
 */
export function ConversationStateBadge({
  conversation,
  className
}: {
  conversation: Pick<ConversationListItem, 'status' | 'humanTakeover' | 'handoffStatus'>;
  className?: string;
}) {
  const state = conversationAttention(conversation);
  return (
    <StatusPill tone={ATTENTION_TONE[state]} dot={state === 'needs_you'} className={className}>
      {state === 'with_you' && <Icons.humanAgent className='size-3' aria-hidden='true' />}
      {state === 'ai' && <Icons.aiAgent className='size-3' aria-hidden='true' />}
      {state === 'closed' && <Icons.circleCheck className='size-3' aria-hidden='true' />}
      {ATTENTION_LABEL[state]}
    </StatusPill>
  );
}

/** Conversation lifecycle: open, handed off, or closed. Always pairs an icon with a text label. */
export function ConversationStatusBadge({
  status,
  className
}: {
  status: ConversationStatus;
  className?: string;
}) {
  if (status === 'handed_off') {
    return (
      <StatusPill tone='attention' className={className}>
        <Icons.warning className='size-3' aria-hidden='true' />
        Handed off
      </StatusPill>
    );
  }
  if (status === 'closed') {
    return (
      <StatusPill tone='neutral' className={className}>
        <Icons.circleCheck className='size-3' aria-hidden='true' />
        Closed
      </StatusPill>
    );
  }
  return (
    <StatusPill tone='info' className={className}>
      <Icons.circle className='size-3' aria-hidden='true' />
      Open
    </StatusPill>
  );
}

/** Who currently owns replying: the AI receptionist, or a human operator who took over. */
export function HumanTakeoverBadge({
  humanTakeover,
  className
}: {
  humanTakeover: boolean;
  className?: string;
}) {
  return humanTakeover ? (
    <StatusPill tone='info' className={className}>
      <Icons.humanAgent className='size-3' aria-hidden='true' />
      Human
    </StatusPill>
  ) : (
    <StatusPill tone='neutral' className={className}>
      <Icons.aiAgent className='size-3' aria-hidden='true' />
      AI
    </StatusPill>
  );
}

/**
 * Only rendered when a `handoffs` row exists for the conversation.
 * `humanTakeover` disambiguates the one status (`contacted`) that alone
 * doesn't say whether an owner is actively handling it or already sent
 * it back to automation — see handoffStatusIndicatorLabel() in
 * utils/format.ts.
 */
export function HandoffStatusIndicator({
  status,
  humanTakeover,
  className
}: {
  status: HandoffStatus;
  humanTakeover: boolean;
  className?: string;
}) {
  const label = handoffStatusIndicatorLabel(status, humanTakeover);
  const isSettled = status === 'resolved' || (status === 'contacted' && !humanTakeover);
  const Icon =
    status === 'new' ? Icons.warning : status === 'resolved' ? Icons.circleCheck : Icons.humanAgent;

  return (
    <StatusPill
      tone={isSettled ? 'neutral' : status === 'new' ? 'attention' : 'info'}
      className={className}
    >
      <Icon className='size-3' aria-hidden='true' />
      {label}
    </StatusPill>
  );
}
