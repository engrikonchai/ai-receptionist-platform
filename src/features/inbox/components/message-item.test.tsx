// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../api/types';
import { MessageItem } from './message-item';

function message(overrides: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'Hello there',
    createdAt: '2026-01-01T10:00:00Z',
    senderType: null,
    ...overrides
  };
}

describe('MessageItem', () => {
  it('labels a customer (role=user) message "Customer"', () => {
    render(<MessageItem message={message({ role: 'user', content: 'Hi, any vacancies?' })} />);
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Hi, any vacancies?')).toBeInTheDocument();
  });

  it('labels an AI-authored assistant message "AI Receptionist"', () => {
    render(
      <MessageItem
        message={message({ role: 'assistant', senderType: 'ai', content: 'Let me check.' })}
      />
    );
    expect(screen.getByText('AI Receptionist')).toBeInTheDocument();
    expect(screen.queryByText('Human operator')).not.toBeInTheDocument();
  });

  it('treats a null sender_type on an assistant message as AI (backward compatibility)', () => {
    render(
      <MessageItem
        message={message({ role: 'assistant', senderType: null, content: 'Pre-migration row.' })}
      />
    );
    expect(screen.getByText('AI Receptionist')).toBeInTheDocument();
  });

  it('labels a human-authored assistant message "Human operator"', () => {
    render(
      <MessageItem
        message={message({
          role: 'assistant',
          senderType: 'human',
          content: 'Hi, this is the owner.'
        })}
      />
    );
    expect(screen.getByText('Human operator')).toBeInTheDocument();
    expect(screen.queryByText('AI Receptionist')).not.toBeInTheDocument();
  });

  it('renders a system message without a sender label, just the content', () => {
    render(
      <MessageItem
        message={message({ role: 'system', senderType: null, content: 'Conversation resolved.' })}
      />
    );
    expect(screen.getByText(/Conversation resolved\./)).toBeInTheDocument();
    expect(screen.queryByText('AI Receptionist')).not.toBeInTheDocument();
    expect(screen.queryByText('Human operator')).not.toBeInTheDocument();
  });
});
