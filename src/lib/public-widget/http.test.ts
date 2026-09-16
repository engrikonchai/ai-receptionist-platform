import { describe, expect, it } from 'vitest';
import { handlePreflight, MAX_REQUEST_BODY_BYTES, readJsonBody } from './http';

function request(body: string): Request {
  return new Request('https://platform.example/api/public-widget/message', {
    method: 'POST',
    body
  });
}

describe('readJsonBody', () => {
  it('parses a well-formed, reasonably sized JSON body', async () => {
    const result = await readJsonBody(request(JSON.stringify({ a: 1 })));
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it('rejects invalid JSON', async () => {
    const result = await readJsonBody(request('{not json'));
    expect(result).toEqual({ ok: false });
  });

  it('rejects a body over the raw byte-size cap before parsing it', async () => {
    const oversized = JSON.stringify({ message: 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1) });
    const result = await readJsonBody(request(oversized));
    expect(result).toEqual({ ok: false });
  });

  it('accepts a body right at the cap', async () => {
    const padding = 'x'.repeat(MAX_REQUEST_BODY_BYTES - 20);
    const body = JSON.stringify({ message: padding });
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES);
    const result = await readJsonBody(request(body));
    expect(result.ok).toBe(true);
  });
});

describe('handlePreflight', () => {
  it('returns 204 with no CORS headers when there is no Origin header', () => {
    const response = handlePreflight(
      new Request('https://platform.example', { method: 'OPTIONS' })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('echoes the origin and never uses a wildcard', () => {
    const response = handlePreflight(
      new Request('https://platform.example', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' }
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });
});
