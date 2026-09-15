// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendHumanReplyResult } from '../api/types';
import { Composer } from './composer';

const mutationFn = vi.fn<(input: unknown) => Promise<SendHumanReplyResult>>();

vi.mock('../api/queries', () => ({
  sendHumanReplyMutation: () => ({ mutationFn })
}));

function renderComposer(props: Partial<React.ComponentProps<typeof Composer>> = {}): {
  user: ReturnType<typeof userEvent.setup>;
} {
  const queryClient = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(
    <Composer
      businessId='biz-1'
      conversationId='conv-1'
      conversationName='Sarah Bennett'
      canSend
      disabledReason='Take over this conversation to send a reply.'
      focusSignal={0}
      {...props}
    />,
    { wrapper: Wrapper }
  );

  return { user: userEvent.setup() };
}

/** A promise the test controls the resolution of, to observe the pending state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mutationFn.mockReset();
});

describe('Composer — disabled states', () => {
  it('shows the explanation instead of an input when the AI is still handling the conversation', () => {
    renderComposer({ canSend: false, disabledReason: 'Take over this conversation to reply.' });

    expect(screen.getByText('Take over this conversation to reply.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows a reopen explanation for a closed conversation', () => {
    renderComposer({ canSend: false, disabledReason: 'Reopen this conversation to send a reply.' });

    expect(screen.getByText('Reopen this conversation to send a reply.')).toBeInTheDocument();
  });
});

describe('Composer — keyboard behavior', () => {
  it('Enter sends the message', async () => {
    mutationFn.mockResolvedValue({
      success: true,
      message: {
        id: 'm1',
        role: 'assistant',
        senderType: 'human',
        content: 'Hi!',
        createdAt: 'now'
      }
    });
    const { user } = renderComposer();

    await user.type(screen.getByRole('textbox'), 'Hi!{Enter}');

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    expect(mutationFn.mock.calls[0]?.[0]).toMatchObject({
      conversationId: 'conv-1',
      content: 'Hi!'
    });
  });

  it('Shift+Enter inserts a new line instead of sending', async () => {
    const { user } = renderComposer();
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, 'Line one{Shift>}{Enter}{/Shift}Line two');

    expect(mutationFn).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line one\nLine two');
  });

  it('never sends a blank or whitespace-only message', async () => {
    const { user } = renderComposer();

    await user.type(screen.getByRole('textbox'), '   {Enter}');

    expect(mutationFn).not.toHaveBeenCalled();
  });
});

describe('Composer — loading and duplicate-submission guards', () => {
  it('disables the input and send button and shows a spinner while sending', async () => {
    const { promise, resolve } = deferred<SendHumanReplyResult>();
    mutationFn.mockReturnValue(promise);
    const { user } = renderComposer();

    await user.type(screen.getByRole('textbox'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(screen.getByRole('textbox')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    resolve({
      success: true,
      message: {
        id: 'm1',
        role: 'assistant',
        senderType: 'human',
        content: 'Hello',
        createdAt: 'now'
      }
    });
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
  });

  it('a second click while a send is in flight never triggers a second call', async () => {
    const { promise, resolve } = deferred<SendHumanReplyResult>();
    mutationFn.mockReturnValue(promise);
    const { user } = renderComposer();

    await user.type(screen.getByRole('textbox'), 'Hello');
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    await user.click(sendButton);
    await user.click(sendButton); // disabled once pending — must be a no-op

    expect(mutationFn).toHaveBeenCalledTimes(1);
    resolve({
      success: true,
      message: {
        id: 'm1',
        role: 'assistant',
        senderType: 'human',
        content: 'Hello',
        createdAt: 'now'
      }
    });
  });
});

describe('Composer — success and failure outcomes', () => {
  it('clears the draft once the send succeeds', async () => {
    mutationFn.mockResolvedValue({
      success: true,
      message: {
        id: 'm1',
        role: 'assistant',
        senderType: 'human',
        content: 'Hi!',
        createdAt: 'now'
      }
    });
    const { user } = renderComposer();
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, 'Hi!{Enter}');

    await waitFor(() => expect(textarea).toHaveValue(''));
  });

  it('keeps the typed draft and shows the server’s friendly error on a typed failure result', async () => {
    mutationFn.mockResolvedValue({
      success: false,
      error: 'Take over this conversation before sending a reply.'
    });
    const { user } = renderComposer();
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, 'Still here?{Enter}');

    expect(
      await screen.findByText('Take over this conversation before sending a reply.')
    ).toBeInTheDocument();
    expect(textarea).toHaveValue('Still here?');
  });

  it('keeps the typed draft and shows a generic retryable error when the request itself throws', async () => {
    mutationFn.mockRejectedValue(new Error('network down'));
    const { user } = renderComposer();
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, 'Are you there?{Enter}');

    expect(
      await screen.findByText('Something went wrong sending your message. Please try again.')
    ).toBeInTheDocument();
    expect(textarea).toHaveValue('Are you there?');
  });
});
