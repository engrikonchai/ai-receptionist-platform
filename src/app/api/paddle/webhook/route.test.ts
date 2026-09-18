import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { POST } from './route';

const unmarshal = vi.fn();
const subscriptionsGet = vi.fn();
const getPaddleClient = vi.fn();
const getPaddleWebhookSecret = vi.fn();
const createSupabaseServiceRoleClient = vi.fn();
const syncSubscriptionFromPaddle = vi.fn();

vi.mock('@/lib/paddle/client', () => ({
  getPaddleClient: (...args: unknown[]) => getPaddleClient(...args),
  getPaddleWebhookSecret: (...args: unknown[]) => getPaddleWebhookSecret(...args)
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

vi.mock('@/lib/paddle/sync', () => ({
  syncSubscriptionFromPaddle: (...args: unknown[]) => syncSubscriptionFromPaddle(...args)
}));

/** Same stand-in for Supabase's PostgREST query builder used across this repo's other service.test.ts files. */
function chainable<T>(result: T) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T) => void, reject?: (reason: unknown) => void) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === 'catch') {
          return (reject: (reason: unknown) => void) => Promise.resolve(result).catch(reject);
        }
        return () => proxy;
      }
    }
  );
  return proxy;
}

function mockClient(from: ReturnType<typeof vi.fn>): SupabaseClient {
  return { from } as unknown as SupabaseClient;
}

function request(rawBody: string, signature: string | null = 'ts=1;h1=validsig') {
  const headers: Record<string, string> = {};
  if (signature) headers['paddle-signature'] = signature;
  return new Request('https://platform.example/api/paddle/webhook', {
    method: 'POST',
    headers,
    body: rawBody
  });
}

function fakeEvent(overrides: Record<string, unknown>) {
  return {
    eventId: 'evt_123',
    eventType: 'subscription.created',
    occurredAt: '2026-01-01T00:00:00.000Z',
    data: {},
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPaddleWebhookSecret.mockReturnValue('ntfset_test');
  getPaddleClient.mockReturnValue({
    webhooks: { unmarshal },
    subscriptions: { get: subscriptionsGet }
  });
});

describe('POST /api/paddle/webhook — configuration and signature', () => {
  it('fails closed with 503 when Paddle is not configured', async () => {
    getPaddleClient.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
    expect(unmarshal).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the webhook secret is not configured', async () => {
    getPaddleWebhookSecret.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
  });

  it('rejects a request with no paddle-signature header', async () => {
    const response = await POST(request('{}', null));

    expect(response.status).toBe(400);
    expect(unmarshal).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without processing anything', async () => {
    unmarshal.mockRejectedValue(new Error('[Paddle] Webhook signature verification failed'));

    const response = await POST(request('{"event_id":"evt_1"}'));

    expect(response.status).toBe(400);
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the service-role client cannot be created', async () => {
    unmarshal.mockResolvedValue(fakeEvent({}));
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
  });
});

describe('POST /api/paddle/webhook — idempotency', () => {
  it('returns 200 for an already-processed event without reprocessing it', async () => {
    unmarshal.mockResolvedValue(fakeEvent({}));
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: { paddle_event_id: 'evt_123' }, error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromPaddle).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('records the event in the ledger only after successful processing', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(2, 'paddle_webhook_events');
  });

  it('does not write a ledger row when processing fails, so a retry can reprocess the event', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: false, reason: 'db_error' });

    const response = await POST(request('{}'));

    expect(response.status).toBe(500);
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/paddle/webhook — fail-closed ledger error handling', () => {
  it('returns 500 when the initial duplicate-check lookup itself fails, without processing the event', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'connection reset' } }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));

    const response = await POST(request('{}'));

    expect(response.status).toBe(500);
    expect(syncSubscriptionFromPaddle).not.toHaveBeenCalled();
  });

  it('returns 500 when the final ledger insert fails for a reason other than a duplicate-key violation', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(
        chainable({ error: { code: '53300', message: 'too many connections' } })
      );
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const response = await POST(request('{}'));

    expect(response.status).toBe(500);
  });

  it('returns 200 when the ledger insert fails with a unique-violation — a concurrent identical delivery already recorded it', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ error: { code: '23505', message: 'duplicate key' } }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
  });

  it('reprocesses successfully on retry after a prior ledger-write failure, since no row was recorded', async () => {
    unmarshal.mockResolvedValue(
      fakeEvent({ eventType: 'subscription.updated', data: { id: 'sub_1' } })
    );
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });

    const failingFrom = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(
        chainable({ error: { code: '53300', message: 'too many connections' } })
      );
    createSupabaseServiceRoleClient.mockReturnValueOnce(mockClient(failingFrom));
    const firstResponse = await POST(request('{}'));
    expect(firstResponse.status).toBe(500);

    const succeedingFrom = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValueOnce(mockClient(succeedingFrom));
    const secondResponse = await POST(request('{}'));

    expect(secondResponse.status).toBe(200);
    expect(syncSubscriptionFromPaddle).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/paddle/webhook — subscription.* events sync directly from the event payload', () => {
  function setUpNewEvent() {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });
    return from;
  }

  it.each([
    'subscription.created',
    'subscription.updated',
    'subscription.activated',
    'subscription.trialing',
    'subscription.past_due',
    'subscription.paused',
    'subscription.canceled',
    'subscription.resumed'
  ])(
    'synchronizes %s directly from the event data, with the event’s own occurred_at',
    async (type) => {
      setUpNewEvent();
      const subscriptionPayload = { id: 'sub_77', status: 'active' };
      unmarshal.mockResolvedValue(
        fakeEvent({
          eventType: type,
          occurredAt: '2026-05-01T00:00:00.000Z',
          data: subscriptionPayload
        })
      );

      const response = await POST(request('{}'));

      expect(response.status).toBe(200);
      expect(syncSubscriptionFromPaddle).toHaveBeenCalledWith(
        expect.anything(),
        subscriptionPayload,
        '2026-05-01T00:00:00.000Z'
      );
      // Never re-fetches — the webhook payload is itself authoritative.
      expect(subscriptionsGet).not.toHaveBeenCalled();
    }
  );

  it('acknowledges an unhandled event type with 200 and takes no action', async () => {
    setUpNewEvent();
    unmarshal.mockResolvedValue(fakeEvent({ eventType: 'customer.created', data: {} }));

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromPaddle).not.toHaveBeenCalled();
  });
});

describe('POST /api/paddle/webhook — transaction.completed', () => {
  function setUpNewEvent() {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) })
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });
    return from;
  }

  it('fetches the subscription and synchronizes it, then marks the checkout attempt completed', async () => {
    const from = setUpNewEvent();
    const fetchedSubscription = { id: 'sub_42', status: 'active' };
    subscriptionsGet.mockResolvedValue(fetchedSubscription);
    unmarshal.mockResolvedValue(
      fakeEvent({
        eventType: 'transaction.completed',
        occurredAt: '2026-05-01T00:00:00.000Z',
        data: { id: 'txn_1', subscriptionId: 'sub_42' }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(subscriptionsGet).toHaveBeenCalledWith('sub_42');
    expect(syncSubscriptionFromPaddle).toHaveBeenCalledWith(
      expect.anything(),
      fetchedSubscription,
      '2026-05-01T00:00:00.000Z',
      'txn_1'
    );
    expect(from).toHaveBeenNthCalledWith(2, 'billing_checkout_attempts');
  });

  it('fails (500, no ledger row) a transaction.completed with no subscription id attached', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    unmarshal.mockResolvedValue(
      fakeEvent({
        eventType: 'transaction.completed',
        data: { id: 'txn_1', subscriptionId: null }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(500);
    expect(syncSubscriptionFromPaddle).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('does not fail the whole request when marking the checkout attempt completed itself fails', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: null }))
      .mockReturnValueOnce({
        update: () => {
          throw new Error('unexpected db error');
        }
      })
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    subscriptionsGet.mockResolvedValue({ id: 'sub_42' });
    syncSubscriptionFromPaddle.mockResolvedValue({ ok: true });
    unmarshal.mockResolvedValue(
      fakeEvent({
        eventType: 'transaction.completed',
        data: { id: 'txn_1', subscriptionId: 'sub_42' }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
  });
});
