// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoChat } from './use-demo-chat';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function openNorthside() {
  const { result } = renderHook(() => useDemoChat());
  act(() => result.current.actions.selectBusiness('fitness-studio'));
  act(() => result.current.actions.openChat());
  return result;
}

describe('useDemoChat', () => {
  it('starts idle with no business selected', () => {
    const { result } = renderHook(() => useDemoChat());
    expect(result.current.state.phase).toBe('selector');
    expect(result.current.state.selectedBusinessId).toBeNull();
  });

  it('opening the chat requires a selected business and shows the greeting', () => {
    const { result } = renderHook(() => useDemoChat());
    act(() => result.current.actions.openChat());
    expect(result.current.state.phase).toBe('selector');

    act(() => result.current.actions.selectBusiness('fitness-studio'));
    act(() => result.current.actions.openChat());
    expect(result.current.state.phase).toBe('chat');
    expect(result.current.state.messages).toHaveLength(1);
    expect(result.current.state.messages[0]).toMatchObject({ kind: 'receptionist' });
  });

  it('sending a matching question resolves to a scripted knowledge-base answer after the typing delay', () => {
    const result = openNorthside();

    act(() => result.current.actions.sendMessage('What are your hours?'));
    expect(result.current.state.pending).not.toBeNull();
    expect(result.current.state.messages.at(-1)).toMatchObject({
      kind: 'visitor',
      status: 'sending'
    });

    act(() => vi.advanceTimersByTime(700));

    expect(result.current.state.pending).toBeNull();
    const last = result.current.state.messages.at(-1);
    expect(last).toMatchObject({ kind: 'receptionist', sourceTopic: 'Opening hours' });
    expect(result.current.state.answeredTopics).toContain('Opening hours');
  });

  it('an unmatched question resolves to the no-match prompt, which can be dismissed', () => {
    const result = openNorthside();
    const business = result.current.state.selectedBusinessId!;
    void business;

    act(() => result.current.actions.sendMessage('Do you sell gift vouchers?'));
    act(() => vi.advanceTimersByTime(700));

    const prompt = result.current.state.messages.find((m) => m.kind === 'no-match-prompt');
    expect(prompt).toBeDefined();
    expect(prompt).toMatchObject({ resolved: false });

    act(() => result.current.actions.dismissNoMatch(prompt!.id));
    const updated = result.current.state.messages.find((m) => m.id === prompt!.id);
    expect(updated).toMatchObject({ resolved: true });
  });

  it('"Yes, pass it on" from a no-match prompt triggers handoff without going through matching again', () => {
    const result = openNorthside();

    act(() => result.current.actions.sendMessage('Do you sell gift vouchers?'));
    act(() => vi.advanceTimersByTime(700));
    const prompt = result.current.state.messages.find((m) => m.kind === 'no-match-prompt')!;

    act(() => result.current.actions.requestHandoff(prompt.id));

    expect(result.current.state.handoffOccurred).toBe(true);
    expect(result.current.state.messages.some((m) => m.kind === 'handoff-banner')).toBe(true);
  });

  it('asking to talk to a person resolves to a handoff banner', () => {
    const result = openNorthside();

    act(() => result.current.actions.sendMessage('Talk to a person'));
    act(() => vi.advanceTimersByTime(700));

    expect(result.current.state.handoffOccurred).toBe(true);
    expect(result.current.state.messages.some((m) => m.kind === 'handoff-banner')).toBe(true);
  });

  it('goToInboxOutcome moves to the handoff-outcome phase', () => {
    const result = openNorthside();
    act(() => result.current.actions.sendMessage('Talk to a person'));
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current.actions.goToInboxOutcome());
    expect(result.current.state.phase).toBe('handoff-outcome');
  });

  it('lead capture: request, submit, and reflect leadCaptured', () => {
    const result = openNorthside();

    act(() => result.current.actions.requestLeadForm());
    expect(result.current.state.messages.some((m) => m.kind === 'lead-form')).toBe(true);

    act(() => result.current.actions.submitLead('Sam Okafor', 'sam.okafor@mail.com'));
    expect(result.current.state.leadCaptured).toBe(true);
    expect(result.current.state.messages.some((m) => m.kind === 'lead-captured')).toBe(true);
    expect(result.current.state.messages.some((m) => m.kind === 'lead-form')).toBe(false);
  });

  it('requesting the lead form twice does not duplicate it', () => {
    const result = openNorthside();
    act(() => result.current.actions.requestLeadForm());
    act(() => result.current.actions.requestLeadForm());
    expect(result.current.state.messages.filter((m) => m.kind === 'lead-form')).toHaveLength(1);
  });

  it('a dismissed lead form can be requested again', () => {
    const result = openNorthside();
    act(() => result.current.actions.requestLeadForm());
    act(() => result.current.actions.dismissLeadForm());
    expect(result.current.state.messages.some((m) => m.kind === 'lead-form')).toBe(false);
    act(() => result.current.actions.requestLeadForm());
    expect(result.current.state.messages.some((m) => m.kind === 'lead-form')).toBe(true);
  });

  it('simulateFailure adds a failed message immediately, with no pending typing state', () => {
    const result = openNorthside();
    act(() => result.current.actions.simulateFailure());
    expect(result.current.state.pending).toBeNull();
    expect(result.current.state.messages.at(-1)).toMatchObject({
      kind: 'visitor',
      status: 'failed'
    });
  });

  it('retrying a failed message resolves it normally', () => {
    const result = openNorthside();
    act(() => result.current.actions.simulateFailure());
    const failed = result.current.state.messages.at(-1)!;
    expect(failed).toMatchObject({ status: 'failed' });

    act(() => result.current.actions.retryMessage(failed.id));
    expect(result.current.state.pending).not.toBeNull();

    act(() => vi.advanceTimersByTime(700));
    const resent = result.current.state.messages.find((m) => m.id === failed.id);
    expect(resent).toMatchObject({ status: 'sent' });
  });

  it('switching business resets the conversation but keeps the previous selection highlighted', () => {
    const result = openNorthside();
    act(() => result.current.actions.sendMessage('What are your hours?'));
    act(() => vi.advanceTimersByTime(700));

    act(() => result.current.actions.switchBusiness());
    expect(result.current.state.phase).toBe('selector');
    expect(result.current.state.messages).toHaveLength(0);
    expect(result.current.state.selectedBusinessId).toBe('fitness-studio');
  });

  it('reset returns to the initial idle state entirely', () => {
    const result = openNorthside();
    act(() => result.current.actions.sendMessage('What are your hours?'));
    act(() => vi.advanceTimersByTime(700));

    act(() => result.current.actions.reset());
    expect(result.current.state.phase).toBe('selector');
    expect(result.current.state.selectedBusinessId).toBeNull();
    expect(result.current.state.messages).toHaveLength(0);
  });

  it('sending blank/whitespace-only text is a no-op', () => {
    const result = openNorthside();
    const before = result.current.state.messages.length;
    act(() => result.current.actions.sendMessage('   '));
    expect(result.current.state.messages).toHaveLength(before);
  });
});
