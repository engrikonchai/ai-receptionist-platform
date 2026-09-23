'use client';

import { useId, useState } from 'react';

type LeadCaptureCardProps = {
  onSubmit: (name: string, email: string) => void;
  onDismiss: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Entirely local and fictional — nothing here is sent to Supabase or
 * any API. Minimal fields only, per this milestone's "do not overbuild
 * a production lead system" constraint.
 */
export function LeadCaptureCard({ onSubmit, onDismiss }: LeadCaptureCardProps) {
  const nameId = useId();
  const emailId = useId();
  const errorId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setError('Enter a name and an email address.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    onSubmit(trimmedName, trimmedEmail);
  }

  return (
    <div className='bg-daylight-surface-muted rounded-daylight-card-sm max-w-[85%] p-5'>
      <p className='text-daylight-ink text-[14px] font-bold'>Share your details</p>
      <p className='text-daylight-muted mt-1 text-[13px] leading-relaxed'>
        These example details are part of the interactive demo — they won&apos;t be sent or stored.
      </p>
      <form onSubmit={handleSubmit} noValidate className='mt-3.5 flex flex-col gap-3'>
        <div>
          <label htmlFor={nameId} className='text-daylight-ink-soft text-xs font-semibold'>
            Name
          </label>
          <input
            id={nameId}
            type='text'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Sam Okafor'
            aria-label='Name'
            aria-describedby={error ? errorId : undefined}
            className='border-daylight-border focus-visible:border-daylight-indigo focus-visible:outline-daylight-focus mt-1 w-full rounded-daylight-control border-1.5 bg-white px-3.5 py-2.5 text-[14px] text-daylight-ink outline-none focus-visible:outline-2'
          />
        </div>
        <div>
          <label htmlFor={emailId} className='text-daylight-ink-soft text-xs font-semibold'>
            Email
          </label>
          <input
            id={emailId}
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='sam.okafor@mail.com'
            aria-label='Email'
            aria-describedby={error ? errorId : undefined}
            className='border-daylight-border focus-visible:border-daylight-indigo focus-visible:outline-daylight-focus mt-1 w-full rounded-daylight-control border-1.5 bg-white px-3.5 py-2.5 text-[14px] text-daylight-ink outline-none focus-visible:outline-2'
          />
        </div>
        {error ? (
          <p id={errorId} role='alert' className='text-daylight-danger text-[13px] font-semibold'>
            {error}
          </p>
        ) : null}
        <div className='flex flex-wrap items-center gap-3'>
          <button
            type='submit'
            className='bg-daylight-indigo hover:bg-daylight-indigo-hover focus-visible:outline-daylight-focus rounded-daylight-button min-h-11 px-4.5 text-[13px] font-bold whitespace-nowrap text-white focus-visible:outline-2'
          >
            Save details (demo)
          </button>
          <button
            type='button'
            onClick={onDismiss}
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus min-h-11 rounded-daylight-control px-2 text-[13px] font-semibold whitespace-nowrap focus-visible:outline-2'
          >
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}
