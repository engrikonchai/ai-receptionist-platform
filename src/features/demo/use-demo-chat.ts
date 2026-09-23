'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { matchVisitorMessage } from './match-answer';
import { getDemoBusiness } from './scenarios';
import type { DemoMessage, DemoState, MatchResult } from './types';

type DemoAction =
  | { type: 'SELECT_BUSINESS'; businessId: string }
  | { type: 'OPEN_CHAT' }
  | { type: 'SWITCH_BUSINESS' }
  | { type: 'SEND_MESSAGE'; messageId: string; text: string }
  | { type: 'SIMULATE_FAILURE'; messageId: string; text: string }
  | { type: 'RETRY_MESSAGE'; messageId: string }
  | { type: 'RESOLVE_MESSAGE'; messageId: string; result: MatchResult }
  | { type: 'REQUEST_LEAD_FORM' }
  | { type: 'DISMISS_LEAD_FORM' }
  | { type: 'SUBMIT_LEAD'; name: string; email: string }
  | { type: 'DISMISS_NO_MATCH'; messageId: string }
  | { type: 'REQUEST_HANDOFF'; sourceMessageId: string }
  | { type: 'GO_TO_INBOX_OUTCOME' }
  | { type: 'RESET' };

const initialState: DemoState = {
  phase: 'selector',
  selectedBusinessId: null,
  messages: [],
  pending: null,
  leadCaptured: false,
  handoffOccurred: false,
  answeredTopics: [],
  lastVisitorQuestion: ''
};

const HANDOFF_ACK_TEXT = 'Let me pass this to the team.';
const NO_MATCH_TEXT =
  "I don't have an answer for that yet. Would you like me to pass your question to the team?";

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'SELECT_BUSINESS':
      return { ...state, selectedBusinessId: action.businessId };

    case 'OPEN_CHAT': {
      if (!state.selectedBusinessId) return state;
      const business = getDemoBusiness(state.selectedBusinessId);
      if (!business) return state;
      const greeting: DemoMessage = {
        id: 'greeting',
        kind: 'receptionist',
        text: business.greeting
      };
      return {
        ...initialState,
        selectedBusinessId: state.selectedBusinessId,
        phase: 'chat',
        messages: [greeting]
      };
    }

    case 'SWITCH_BUSINESS':
      return { ...initialState, selectedBusinessId: state.selectedBusinessId, phase: 'selector' };

    case 'SEND_MESSAGE': {
      const message: DemoMessage = {
        id: action.messageId,
        kind: 'visitor',
        text: action.text,
        status: 'sending'
      };
      return {
        ...state,
        messages: [...state.messages, message],
        pending: { messageId: action.messageId, text: action.text },
        lastVisitorQuestion: action.text
      };
    }

    case 'SIMULATE_FAILURE': {
      const message: DemoMessage = {
        id: action.messageId,
        kind: 'visitor',
        text: action.text,
        status: 'failed'
      };
      return { ...state, messages: [...state.messages, message] };
    }

    case 'RETRY_MESSAGE': {
      const target = state.messages.find((m) => m.id === action.messageId);
      if (!target || target.kind !== 'visitor' || target.status !== 'failed') return state;
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId && m.kind === 'visitor'
            ? { ...m, status: 'sending' as const }
            : m
        ),
        pending: { messageId: action.messageId, text: target.text },
        lastVisitorQuestion: target.text
      };
    }

    case 'RESOLVE_MESSAGE': {
      if (state.pending?.messageId !== action.messageId) return state;
      const messages = state.messages.map((m) =>
        m.id === action.messageId && m.kind === 'visitor' ? { ...m, status: 'sent' as const } : m
      );
      const { result } = action;

      if (result.kind === 'answer') {
        messages.push({
          id: `${action.messageId}-reply`,
          kind: 'receptionist',
          text: result.entry.answer,
          sourceTopic: result.entry.topic
        });
        return {
          ...state,
          messages,
          pending: null,
          answeredTopics: state.answeredTopics.includes(result.entry.topic)
            ? state.answeredTopics
            : [...state.answeredTopics, result.entry.topic]
        };
      }

      if (result.kind === 'handoff') {
        messages.push({
          id: `${action.messageId}-ack`,
          kind: 'receptionist',
          text: HANDOFF_ACK_TEXT
        });
        messages.push({ id: `${action.messageId}-handoff`, kind: 'handoff-banner' });
        return { ...state, messages, pending: null, handoffOccurred: true };
      }

      messages.push({
        id: `${action.messageId}-nomatch`,
        kind: 'no-match-prompt',
        text: NO_MATCH_TEXT,
        resolved: false
      });
      return { ...state, messages, pending: null };
    }

    case 'REQUEST_LEAD_FORM': {
      if (state.leadCaptured || state.messages.some((m) => m.kind === 'lead-form')) return state;
      return { ...state, messages: [...state.messages, { id: 'lead-form', kind: 'lead-form' }] };
    }

    case 'DISMISS_LEAD_FORM':
      return { ...state, messages: state.messages.filter((m) => m.kind !== 'lead-form') };

    case 'SUBMIT_LEAD': {
      const messages = state.messages.map(
        (m): DemoMessage =>
          m.kind === 'lead-form'
            ? { id: 'lead-captured', kind: 'lead-captured', name: action.name, email: action.email }
            : m
      );
      return { ...state, messages, leadCaptured: true };
    }

    case 'DISMISS_NO_MATCH':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId && m.kind === 'no-match-prompt' ? { ...m, resolved: true } : m
        )
      };

    case 'REQUEST_HANDOFF': {
      const messages = state.messages.map((m) =>
        m.kind === 'no-match-prompt' ? { ...m, resolved: true } : m
      );
      messages.push({
        id: `${action.sourceMessageId}-handoff-ack`,
        kind: 'receptionist',
        text: HANDOFF_ACK_TEXT
      });
      messages.push({ id: `${action.sourceMessageId}-handoff-banner`, kind: 'handoff-banner' });
      return { ...state, messages, handoffOccurred: true };
    }

    case 'GO_TO_INBOX_OUTCOME':
      return { ...state, phase: 'handoff-outcome' };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Drives the entire /demo experience. Pure, typed reducer plus one
 * effect that simulates a receptionist "typing" delay before resolving
 * a message through the local keyword matcher — no network calls, no
 * Supabase, no production reply engine.
 */
export function useDemoChat() {
  const [state, dispatch] = useReducer(demoReducer, initialState);
  const idCounter = useRef(0);
  const nextId = useCallback((prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  }, []);

  useEffect(() => {
    if (!state.pending || !state.selectedBusinessId) return;
    const business = getDemoBusiness(state.selectedBusinessId);
    if (!business) return;

    const { messageId, text } = state.pending;
    const result = matchVisitorMessage(business, text);
    const delay = prefersReducedMotion() ? 50 : 650;

    const timeoutId = window.setTimeout(() => {
      dispatch({ type: 'RESOLVE_MESSAGE', messageId, result });
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [state.pending, state.selectedBusinessId]);

  const selectBusiness = useCallback(
    (businessId: string) => dispatch({ type: 'SELECT_BUSINESS', businessId }),
    []
  );
  const openChat = useCallback(() => dispatch({ type: 'OPEN_CHAT' }), []);
  const switchBusiness = useCallback(() => dispatch({ type: 'SWITCH_BUSINESS' }), []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      dispatch({ type: 'SEND_MESSAGE', messageId: nextId('msg'), text: trimmed });
    },
    [nextId]
  );

  const simulateFailure = useCallback(() => {
    if (!state.selectedBusinessId) return;
    const business = getDemoBusiness(state.selectedBusinessId);
    if (!business) return;
    dispatch({
      type: 'SIMULATE_FAILURE',
      messageId: nextId('fail'),
      text: business.knowledgeBase[0].sampleQuestion
    });
  }, [nextId, state.selectedBusinessId]);

  const retryMessage = useCallback(
    (messageId: string) => dispatch({ type: 'RETRY_MESSAGE', messageId }),
    []
  );
  const requestLeadForm = useCallback(() => dispatch({ type: 'REQUEST_LEAD_FORM' }), []);
  const dismissLeadForm = useCallback(() => dispatch({ type: 'DISMISS_LEAD_FORM' }), []);
  const submitLead = useCallback(
    (name: string, email: string) => dispatch({ type: 'SUBMIT_LEAD', name, email }),
    []
  );
  const dismissNoMatch = useCallback(
    (messageId: string) => dispatch({ type: 'DISMISS_NO_MATCH', messageId }),
    []
  );
  const requestHandoff = useCallback(
    (sourceMessageId: string) => dispatch({ type: 'REQUEST_HANDOFF', sourceMessageId }),
    []
  );
  const goToInboxOutcome = useCallback(() => dispatch({ type: 'GO_TO_INBOX_OUTCOME' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    state,
    actions: {
      selectBusiness,
      openChat,
      switchBusiness,
      sendMessage,
      simulateFailure,
      retryMessage,
      requestLeadForm,
      dismissLeadForm,
      submitLead,
      dismissNoMatch,
      requestHandoff,
      goToInboxOutcome,
      reset
    }
  };
}
