'use client';

import { FormEvent, useState } from 'react';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useInboxStore } from '../utils/store';
import { LEAD_STATUS_LABEL } from '../utils/format';
import type { Conversation } from '../utils/types';

function DetailRow({
  icon: Icon,
  label,
  value
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  label: string;
  value: string;
}) {
  return (
    <div className='flex items-start gap-2.5 text-sm'>
      <Icon className='text-muted-foreground mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <div className='min-w-0'>
        <p className='text-muted-foreground text-xs'>{label}</p>
        <p className='text-foreground wrap-break-word'>{value}</p>
      </div>
    </div>
  );
}

export function CustomerDetailsContent({ conversation }: { conversation: Conversation }) {
  const addNote = useInboxStore((state) => state.addNote);
  const [noteDraft, setNoteDraft] = useState('');

  const { customer } = conversation;

  const handleAddNote = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    addNote(conversation.id, noteDraft);
    setNoteDraft('');
  };

  return (
    <div className='space-y-4 text-sm'>
      <div>
        <p className='text-foreground text-base font-semibold'>{customer.name}</p>
        <Badge variant='secondary' className='mt-1'>
          {LEAD_STATUS_LABEL[customer.leadStatus]}
        </Badge>
      </div>

      <Separator />

      <div className='space-y-3'>
        <DetailRow icon={Icons.chat} label='Email' value={customer.email} />
        <DetailRow icon={Icons.phone} label='Phone' value={customer.phone} />
      </div>

      <Separator />

      <div className='space-y-3'>
        <DetailRow
          icon={Icons.calendar}
          label='Check-in'
          value={customer.checkIn ?? 'Not specified'}
        />
        <DetailRow
          icon={Icons.calendar}
          label='Check-out'
          value={customer.checkOut ?? 'Not specified'}
        />
        <DetailRow
          icon={Icons.teams}
          label='Guests'
          value={customer.guests !== null ? String(customer.guests) : 'Not specified'}
        />
        <DetailRow
          icon={Icons.pin}
          label='Requested accommodation'
          value={customer.requestedAccommodation}
        />
        <DetailRow
          icon={Icons.creditCard}
          label='Estimated booking value'
          value={customer.estimatedBookingValue}
        />
      </div>

      {customer.tags.length > 0 && (
        <>
          <Separator />
          <div>
            <p className='text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs'>
              <Icons.tag className='size-3.5' aria-hidden='true' />
              Tags
            </p>
            <div className='flex flex-wrap gap-1.5'>
              {customer.tags.map((tag) => (
                <Badge key={tag} variant='outline'>
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      <DetailRow
        icon={Icons.userPen}
        label='Assigned team member'
        value={customer.assignedTeamMember}
      />

      <Separator />

      <div>
        <p className='text-foreground mb-2 text-sm font-medium'>Internal notes</p>
        <div className='space-y-2'>
          {customer.notes.length === 0 ? (
            <p className='text-muted-foreground text-xs'>No notes yet.</p>
          ) : (
            customer.notes.map((note) => (
              <div key={note.id} className='bg-muted rounded-lg p-2.5 text-xs'>
                <p className='text-foreground'>{note.text}</p>
                <p className='text-muted-foreground mt-1'>
                  {note.author} · {note.timestamp}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddNote} className='mt-2.5 space-y-2'>
          <label htmlFor={`note-${conversation.id}`} className='sr-only'>
            Add an internal note
          </label>
          <Textarea
            id={`note-${conversation.id}`}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder='Add an internal note (not visible to the guest)'
            rows={2}
            className='min-h-16 text-sm'
          />
          <Button type='submit' size='sm' variant='outline' disabled={!noteDraft.trim()}>
            <Icons.add className='size-3.5' aria-hidden='true' />
            Add note
          </Button>
        </form>
      </div>
    </div>
  );
}

export function CustomerDetailsPanel({
  conversation,
  className
}: {
  conversation: Conversation;
  className?: string;
}) {
  const collapsed = useInboxStore((state) => state.customerPanelCollapsed);
  const setCollapsed = useInboxStore((state) => state.setCustomerPanelCollapsed);

  if (collapsed) {
    return (
      <Card
        className={cn(
          'hidden h-full min-h-0 w-10 flex-col items-center gap-0 overflow-hidden p-0 lg:flex',
          className
        )}
      >
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='m-1.5'
          onClick={() => setCollapsed(false)}
          aria-label='Show customer details'
        >
          <Icons.chevronsLeft className='size-4' />
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className={cn('hidden h-full min-h-0 flex-col gap-0 overflow-hidden p-0 lg:flex', className)}
    >
      <div className='flex items-center justify-between border-b p-3'>
        <h2 className='text-foreground text-sm font-semibold'>Customer details</h2>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          onClick={() => setCollapsed(true)}
          aria-label='Collapse customer details'
        >
          <Icons.chevronsRight className='size-4' />
        </Button>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        <CustomerDetailsContent conversation={conversation} />
      </div>
    </Card>
  );
}
