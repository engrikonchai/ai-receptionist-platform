import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { verifyActiveBusiness } from './authorize';
import { GENERIC_LOAD_ERROR, GENERIC_SAVE_ERROR, SESSION_EXPIRED_MESSAGE } from './types';
import { fetchAgentSettings, updateAgentSettings } from './service';
import type { AgentSettingsInput } from './types';

vi.mock('./authorize', () => ({
  verifyActiveBusiness: vi.fn()
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}));

/** A stand-in for Supabase's PostgREST query builder — see the identical helper in widget/knowledge's own service.test.ts. */
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

const stubUser = { id: 'user-1' } as unknown as User;
const VERIFIED_BUSINESS_ID = 'biz-verified';

function mockVerifiedBusiness(from: ReturnType<typeof vi.fn>, businessId = VERIFIED_BUSINESS_ID) {
  vi.mocked(verifyActiveBusiness).mockResolvedValue({
    ok: true,
    ctx: { supabase: { from } as unknown as SupabaseClient, user: stubUser, businessId }
  });
}

const agentRow = {
  tone: 'professional',
  response_length: 'balanced',
  custom_instructions: 'Mention that parking must be reserved in advance.'
};

const validInput: AgentSettingsInput = {
  tone: 'friendly',
  responseLength: 'concise',
  customInstructions: 'Keep answers practical and direct.'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchAgentSettings', () => {
  it('propagates the authorization failure instead of querying anything — unauthenticated case', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    await expect(fetchAgentSettings('biz-1')).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it('never queries anything for a business id that is not the caller’s own — cross-business case', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: "We couldn't find that business, or you don't have access to it."
    });

    await expect(fetchAgentSettings('biz-someone-elses')).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });

  it('maps the agent_settings row into camelCase', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: agentRow, error: null }));
    mockVerifiedBusiness(from);

    const result = await fetchAgentSettings('biz-1');

    expect(result).toEqual({
      tone: 'professional',
      responseLength: 'balanced',
      customInstructions: 'Mention that parking must be reserved in advance.'
    });
    expect(from).toHaveBeenCalledWith('agent_settings');
  });

  it('preserves a null custom_instructions as null, never coerces to an empty string', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(
        chainable({ data: { ...agentRow, custom_instructions: null }, error: null })
      );
    mockVerifiedBusiness(from);

    const result = await fetchAgentSettings('biz-1');

    expect(result.customInstructions).toBeNull();
  });

  it('throws a friendly error when the row is missing', async () => {
    const from = vi.fn().mockReturnValueOnce(chainable({ data: null, error: null }));
    mockVerifiedBusiness(from);

    await expect(fetchAgentSettings('biz-1')).rejects.toThrow(GENERIC_LOAD_ERROR);
  });

  it('throws a friendly error on a database failure, never a raw Supabase error', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(chainable({ data: null, error: { message: 'db down' } }));
    mockVerifiedBusiness(from);

    await expect(fetchAgentSettings('biz-1')).rejects.toThrow(GENERIC_LOAD_ERROR);
  });
});

describe('updateAgentSettings', () => {
  it('propagates the authorization failure instead of writing anything — unauthenticated case', async () => {
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE
    });

    const result = await updateAgentSettings('biz-1', validInput);

    expect(result).toEqual({ success: false, error: SESSION_EXPIRED_MESSAGE });
  });

  it('rejects a business id that is not the caller’s own without writing anything — cross-business case', async () => {
    const from = vi.fn();
    vi.mocked(verifyActiveBusiness).mockResolvedValue({
      ok: false,
      error: "We couldn't find that business, or you don't have access to it."
    });

    const result = await updateAgentSettings('biz-someone-elses', validInput);

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an invalid tone before writing anything', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, {
      ...validInput,
      tone: 'sarcastic' as never
    });

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an invalid response length before writing anything', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, {
      ...validInput,
      responseLength: 'verbose' as never
    });

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects custom instructions over 4000 characters (after trimming) before writing anything', async () => {
    const from = vi.fn();
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, {
      ...validInput,
      customInstructions: 'x'.repeat(4001)
    });

    expect(result.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('trims custom instructions before writing', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    await updateAgentSettings(VERIFIED_BUSINESS_ID, {
      ...validInput,
      customInstructions: '  Avoid making promises about availability.  '
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ custom_instructions: 'Avoid making promises about availability.' })
    );
  });

  it('normalizes whitespace-only custom instructions to null, not an error', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, {
      ...validInput,
      customInstructions: '   '
    });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ custom_instructions: null }));
  });

  it('normalizes an empty custom instructions string to null', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    await updateAgentSettings(VERIFIED_BUSINESS_ID, { ...validInput, customInstructions: '' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ custom_instructions: null }));
  });

  it('updates agent_settings, scoped to the verified business id, and stamps configured_at', async () => {
    const eq = vi.fn().mockReturnValue(chainable({ error: null }));
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, validInput);

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith('agent_settings');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'friendly',
        response_length: 'concise',
        custom_instructions: 'Keep answers practical and direct.',
        configured_at: expect.any(String)
      })
    );
    expect(eq).toHaveBeenCalledWith('business_id', VERIFIED_BUSINESS_ID);
  });

  it('never sends agent_settings.id or agent_settings.business_id inside the update payload', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: null }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    await updateAgentSettings(VERIFIED_BUSINESS_ID, validInput);

    const payload = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('business_id');
  });

  it('returns a friendly error on a database failure, never a raw Supabase error', async () => {
    const update = vi.fn().mockReturnValue(chainable({ error: { message: 'db down' } }));
    const from = vi.fn().mockReturnValue({ update });
    mockVerifiedBusiness(from);

    const result = await updateAgentSettings(VERIFIED_BUSINESS_ID, validInput);

    expect(result).toEqual({ success: false, error: GENERIC_SAVE_ERROR });
  });
});
