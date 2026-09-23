'use client';

import { useMemo } from 'react';
import { Icons } from '@/components/icons';
import { getDemoBusiness } from '../scenarios';
import { useDemoChat } from '../use-demo-chat';
import { BusinessSelector } from './business-selector';
import { ChatPanel } from './chat-panel';
import { HandoffOutcome } from './handoff-outcome';

/**
 * Orchestrates the entire /demo journey. Fully client-side and local:
 * no network calls, no Supabase writes, no production reply engine,
 * no AI provider — see src/features/demo/scenarios.ts and
 * ./match-answer.ts for the isolation boundary.
 */
export function DemoExperience() {
  const { state, actions } = useDemoChat();
  const selectedBusiness = state.selectedBusinessId
    ? getDemoBusiness(state.selectedBusinessId)
    : undefined;

  const lead = useMemo(() => {
    const captured = state.messages.find((m) => m.kind === 'lead-captured');
    return captured && captured.kind === 'lead-captured'
      ? { name: captured.name, email: captured.email }
      : null;
  }, [state.messages]);

  return (
    <section className='mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
        <p className='text-daylight-muted text-sm'>
          Every business, person and message on this page is a fictional example.
        </p>
        {state.phase !== 'selector' || state.selectedBusinessId ? (
          <button
            type='button'
            onClick={actions.reset}
            className='text-daylight-ink-soft hover:text-daylight-ink focus-visible:outline-daylight-focus inline-flex items-center gap-1.5 rounded-daylight-control text-sm font-semibold focus-visible:outline-2'
          >
            <Icons.refresh className='size-4' aria-hidden='true' />
            Reset demo
          </button>
        ) : null}
      </div>

      {state.phase === 'selector' ? (
        <BusinessSelector
          selectedBusiness={selectedBusiness}
          onSelect={actions.selectBusiness}
          onOpenChat={actions.openChat}
        />
      ) : null}

      {state.phase === 'chat' && selectedBusiness ? (
        <ChatPanel
          business={selectedBusiness}
          messages={state.messages}
          pending={state.pending !== null}
          leadCaptured={state.leadCaptured}
          handoffOccurred={state.handoffOccurred}
          onSwitchBusiness={actions.switchBusiness}
          onSend={actions.sendMessage}
          onRetry={actions.retryMessage}
          onRequestHandoff={actions.requestHandoff}
          onDismissNoMatch={actions.dismissNoMatch}
          onRequestLeadForm={actions.requestLeadForm}
          onSubmitLead={actions.submitLead}
          onDismissLeadForm={actions.dismissLeadForm}
          onSimulateFailure={actions.simulateFailure}
          onGoToInboxOutcome={actions.goToInboxOutcome}
        />
      ) : null}

      {state.phase === 'handoff-outcome' && selectedBusiness ? (
        <HandoffOutcome
          business={selectedBusiness}
          lastVisitorQuestion={state.lastVisitorQuestion}
          answeredTopics={state.answeredTopics}
          lead={lead}
          messageCount={state.messages.length}
          onTryAnotherBusiness={actions.switchBusiness}
        />
      ) : null}
    </section>
  );
}
