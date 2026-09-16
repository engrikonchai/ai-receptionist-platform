import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabasePublicClient } from '@/lib/supabase/public';
import { fetchWidgetPublicConfig } from './config';

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: vi.fn()
}));

function mockClientReturning(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ maybeSingle });
  vi.mocked(createSupabasePublicClient).mockReturnValue({ rpc } as never);
  return { rpc, maybeSingle };
}

const WIDGET_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.mocked(createSupabasePublicClient).mockReset();
});

describe('fetchWidgetPublicConfig', () => {
  it('never calls the database for an origin that fails to normalize', async () => {
    const { rpc } = mockClientReturning({ title: 'x' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'not-a-url-*');

    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never calls the database when there is no Origin header at all', async () => {
    const { rpc } = mockClientReturning({ title: 'x' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, null);

    expect(result).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls resolve_widget_config with the widget id and the normalized origin', async () => {
    const { rpc } = mockClientReturning({ title: 'Adria Assistant' });

    await fetchWidgetPublicConfig(WIDGET_ID, 'https://Example.com');

    expect(rpc).toHaveBeenCalledWith('resolve_widget_config', {
      p_widget_id: WIDGET_ID,
      p_origin: 'https://example.com'
    });
  });

  it('returns null when the RPC returns no row', async () => {
    mockClientReturning(null);

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns null on a database error instead of throwing', async () => {
    mockClientReturning(null, { message: 'db down' });

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toBeNull();
  });

  it('returns the row when the RPC resolves one', async () => {
    const row = { title: 'Adria Assistant', primary_color: '#1677ff' };
    mockClientReturning(row);

    const result = await fetchWidgetPublicConfig(WIDGET_ID, 'https://example.com');

    expect(result).toEqual(row);
  });
});
