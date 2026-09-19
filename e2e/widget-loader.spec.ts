import { expect, test } from '@playwright/test';

test.describe('/widget-loader.js', () => {
  test('responds successfully with JavaScript and no secret names/values, with no widget session or Supabase connection', async ({
    request
  }) => {
    const response = await request.get('/widget-loader.js');
    expect(response.ok()).toBe(true);

    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/javascript/);

    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    // Loose but effective signal that this really is JS, not e.g. an
    // HTML error page served with a spoofed content-type.
    expect(body).toMatch(/function|const|var|=>/);

    const lower = body.toLowerCase();
    for (const secret of [
      'service_role',
      'supabase_service_role',
      'paddle_api_key',
      'sk_live',
      'sk_test',
      'process.env'
    ]) {
      expect(lower).not.toContain(secret);
    }
  });
});
