import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { POST } from './route';

const constructEventAsync = vi.fn();
const getStripeClient = vi.fn();
const getStripeWebhookSecret = vi.fn();
const createSupabaseServiceRoleClient = vi.fn();
const syncSubscriptionFromStripe = vi.fn();

vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: (...args: unknown[]) => getStripeClient(...args),
  getStripeWebhookSecret: (...args: unknown[]) => getStripeWebhookSecret(...args)
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: (...args: unknown[]) => createSupabaseServiceRoleClient(...args)
}));

vi.mock('@/lib/stripe/sync', () => ({
  syncSubscriptionFromStripe: (...args: unknown[]) => syncSubscriptionFromStripe(...args)
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

function request(rawBody: string, signature: string | null = 'valid-signature') {
  const headers: Record<string, string> = {};
  if (signature) headers['stripe-signature'] = signature;
  return new Request('https://platform.example/api/stripe/webhook', {
    method: 'POST',
    headers,
    body: rawBody
  });
}

function fakeEvent(overrides: Record<string, unknown>) {
  return { id: 'evt_123', type: 'checkout.session.completed', data: { object: {} }, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  getStripeWebhookSecret.mockReturnValue('whsec_test');
  getStripeClient.mockReturnValue({ webhooks: { constructEventAsync } });
});

describe('POST /api/stripe/webhook — configuration and signature', () => {
  it('fails closed with 503 when Stripe is not configured', async () => {
    getStripeClient.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
    expect(constructEventAsync).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the webhook secret is not configured', async () => {
    getStripeWebhookSecret.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
  });

  it('rejects a request with no stripe-signature header', async () => {
    const response = await POST(request('{}', null));

    expect(response.status).toBe(400);
    expect(constructEventAsync).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature without processing anything', async () => {
    constructEventAsync.mockRejectedValue(new Error('signature mismatch'));

    const response = await POST(request('{"id":"evt_1"}'));

    expect(response.status).toBe(400);
    expect(createSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the service-role client cannot be created', async () => {
    constructEventAsync.mockResolvedValue(fakeEvent({}));
    createSupabaseServiceRoleClient.mockReturnValue(null);

    const response = await POST(request('{}'));

    expect(response.status).toBe(503);
  });
});

describe('POST /api/stripe/webhook — idempotency', () => {
  it('returns 200 for an already-processed event without reprocessing it', async () => {
    constructEventAsync.mockResolvedValue(fakeEvent({}));
    const from = vi.fn().mockReturnValueOnce(chainable({ data: { stripe_event_id: 'evt_123' } }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1); // only the duplicate check — no ledger insert
  });

  it('records the event in the ledger only after successful processing', async () => {
    constructEventAsync.mockResolvedValue(
      fakeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } })
    );
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null })) // duplicate check: not found
      .mockReturnValueOnce(chainable({ error: null })); // ledger insert
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromStripe.mockResolvedValue({ ok: true });

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(2, 'stripe_webhook_events');
  });

  it('does not write a ledger row when processing fails, so a retry can reprocess the event', async () => {
    constructEventAsync.mockResolvedValue(
      fakeEvent({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } })
    );
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromStripe.mockResolvedValue({ ok: false, reason: 'db_error' });

    const response = await POST(request('{}'));

    expect(response.status).toBe(500);
    expect(from).toHaveBeenCalledTimes(1); // duplicate check only — never reaches the ledger insert
  });
});

describe('POST /api/stripe/webhook — event synchronization', () => {
  function setUpNewEvent() {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ error: null }));
    createSupabaseServiceRoleClient.mockReturnValue(mockClient(from));
    syncSubscriptionFromStripe.mockResolvedValue({ ok: true });
    return from;
  }

  it('resolves the subscription id from checkout.session.completed and syncs it', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({
        type: 'checkout.session.completed',
        data: { object: { subscription: 'sub_42' } }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sub_42'
    );
  });

  it('never syncs a checkout session with no subscription attached', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({ type: 'checkout.session.completed', data: { object: { subscription: null } } })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it.each([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ])(
    'syncs the subscription id from %s — never trusting any other field on the event payload',
    async (type) => {
      setUpNewEvent();
      constructEventAsync.mockResolvedValue(
        fakeEvent({
          type,
          data: { object: { id: 'sub_77', status: 'canceled', current_period_end: 999 } }
        })
      );

      const response = await POST(request('{}'));

      expect(response.status).toBe(200);
      // Only the id is ever passed on — sync.ts is what re-fetches the
      // authoritative object; the webhook never forwards `status` or
      // any other field from the event payload itself.
      expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'sub_77'
      );
      expect(syncSubscriptionFromStripe).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: expect.anything() })
      );
    }
  );

  it('resolves the subscription id from invoice.paid via parent.subscription_details and syncs it', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({
        type: 'invoice.paid',
        data: { object: { parent: { subscription_details: { subscription: 'sub_99' } } } }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sub_99'
    );
  });

  it('resolves the subscription id from invoice.payment_failed the same way', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({
        type: 'invoice.payment_failed',
        data: { object: { parent: { subscription_details: { subscription: 'sub_55' } } } }
      })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'sub_55'
    );
  });

  it('acknowledges an invoice with no subscription (a one-off invoice) without calling sync', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({ type: 'invoice.paid', data: { object: { parent: null } } })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });

  it('acknowledges an unhandled event type with 200 and takes no action', async () => {
    setUpNewEvent();
    constructEventAsync.mockResolvedValue(
      fakeEvent({ type: 'payment_intent.succeeded', data: { object: {} } })
    );

    const response = await POST(request('{}'));

    expect(response.status).toBe(200);
    expect(syncSubscriptionFromStripe).not.toHaveBeenCalled();
  });
});
