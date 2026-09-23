import { expect, test } from '@playwright/test';
import { captureConsoleText, expectNoHorizontalOverflow } from './helpers';

test.describe('/demo — public interactive demo', () => {
  test('is publicly accessible and shows the intro heading', async ({ page }) => {
    const response = await page.goto('/demo');
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Try the website chat' })).toBeVisible();
  });

  test('has a clear way back to the landing page, and real sign-in/sign-up destinations', async ({
    page
  }) => {
    await page.goto('/demo');
    await expect(page.getByRole('link', { name: /Back/ })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  test('produces no browser console errors on load', async ({ page }) => {
    const pageConsole = captureConsoleText(page);
    await page.goto('/demo', { waitUntil: 'networkidle' });
    expect(pageConsole.all()).toBe('');
  });

  test('"Open the chat" is disabled until a business is selected', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.getByRole('button', { name: 'Open the chat' })).toBeDisabled();
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await expect(page.getByRole('button', { name: 'Open the chat' })).toBeEnabled();
  });

  test('selecting a business shows its sample knowledge base before the chat opens', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await expect(page.getByText('Northside Studio · sample Knowledge Base')).toBeVisible();
    await expect(page.getByText('Opening hours', { exact: true })).toBeVisible();
  });

  test('opening the chat shows the business greeting and moves focus to the composer', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await expect(page.getByText(/Ask me anything about Northside Studio/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused();
  });

  test('a suggested question resolves to a scripted knowledge-base answer', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Do you have beginner classes?' }).click();

    await expect(page.getByText(/Foundations runs Tuesdays and Thursdays/)).toBeVisible();
    await expect(page.getByText('From Knowledge Base · Class types')).toBeVisible();
  });

  test('a free-typed matching question also resolves from the knowledge base', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('what time do you open?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('From Knowledge Base · Opening hours')).toBeVisible();
  });

  test('an unmatched question shows the deterministic no-match prompt, which can be dismissed', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('Do you sell gift vouchers?');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(
      page.getByText("I don't have an answer for that yet. Would you like me to pass your question")
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ask something else' }).click();
    await expect(page.getByText(/Demo note: in a real account/)).toBeVisible();
  });

  test('"Yes, pass it on" from the no-match prompt hands off the conversation', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill('Do you sell gift vouchers?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'Yes, pass it on' }).click();

    await expect(
      page.getByText(/waits in the business's Inbox for a person to reply/)
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'See what happens next' })).toBeVisible();
  });

  test('lead capture: sharing details is entirely local and shows a captured confirmation', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Share my details' }).click();

    await expect(page.getByText(/won't be sent or stored/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Name' }).fill('Sam Okafor');
    await page.getByRole('textbox', { name: 'Email' }).fill('sam.okafor@mail.com');
    await page.getByRole('button', { name: 'Save details (demo)' }).click();

    await expect(page.getByText('Lead captured · Sam Okafor · sam.okafor@mail.com')).toBeVisible();
  });

  test('lead capture form validates an invalid email accessibly', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Share my details' }).click();

    await page.getByRole('textbox', { name: 'Name' }).fill('Sam Okafor');
    await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
    await page.getByRole('button', { name: 'Save details (demo)' }).click();

    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });

  test('asking to talk to a person hands off the conversation', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Talk to a person' }).click();

    await expect(page.getByText('Let me pass this to the team.')).toBeVisible();
    await expect(
      page.getByText(/waits in the business's Inbox for a person to reply/)
    ).toBeVisible();
  });

  test('the Inbox outcome screen represents, but never claims, a real saved conversation', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Talk to a person' }).click();
    await page.getByRole('button', { name: 'See what happens next' }).click();

    await expect(page.getByText('“Talk to a person”')).toBeVisible();
    await expect(page.getByText('Handed off when asked for a person')).toBeVisible();
    await expect(page.getByText("Demo conversation isn't saved.")).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  test('"Try another business" from the outcome screen returns to the selector', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Talk to a person' }).click();
    await page.getByRole('button', { name: 'See what happens next' }).click();
    await page.getByRole('button', { name: 'Try another business' }).click();

    await expect(page.getByRole('heading', { name: 'Try the website chat' })).toBeVisible();
  });

  test('simulating a failed message shows an error state with a working retry', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Simulate a failed message (demo)' }).click();

    await expect(page.getByText('Not sent')).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Not sent')).toHaveCount(0);
    await expect(page.getByText('From Knowledge Base')).toBeVisible();
  });

  test('"Switch business" returns to the selector without losing the previous highlight', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Switch business' }).click();

    await expect(page.getByRole('heading', { name: 'Try the website chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fitness studio' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('"Reset demo" clears the conversation entirely', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Reset demo' }).click();

    await expect(page.getByRole('heading', { name: 'Try the website chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fitness studio' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  test('the chat transcript is an accessible live region with labeled controls', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();

    await expect(page.getByRole('log')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
  });

  test('keyboard: Tab reaches the business selector, and Enter submits the composer', async ({
    page
  }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();

    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toBeFocused();
    await input.fill('What are your hours?');
    await input.press('Enter');

    await expect(page.getByText('From Knowledge Base · Opening hours')).toBeVisible();
  });

  test('every business type from the approved example set is offered', async ({ page }) => {
    await page.goto('/demo');
    for (const label of ['Fitness studio', 'Online shop', 'Café', 'Consultancy', 'Salon']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('makes no invented statistics, pricing, or unsupported claims', async ({ page }) => {
    await page.goto('/demo');
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    for (const claim of ['certified', 'compliant', 'customers trust', '% of', 'guaranteed']) {
      expect(bodyText).not.toContain(claim);
    }
  });

  const WIDTHS = [390, 768, 1440];
  for (const width of WIDTHS) {
    test(`fits the viewport with no horizontal overflow at ${width}px, idle and mid-conversation`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/demo');
      await expectNoHorizontalOverflow(page);

      await page.getByRole('button', { name: 'Fitness studio' }).click();
      await page.getByRole('button', { name: 'Open the chat' }).click();
      await page.getByRole('button', { name: 'Do you have beginner classes?' }).click();
      await expect(page.getByText('From Knowledge Base · Class types')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('remains usable with prefers-reduced-motion enabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Fitness studio' }).click();
    await page.getByRole('button', { name: 'Open the chat' }).click();
    await page.getByRole('button', { name: 'Do you have beginner classes?' }).click();
    await expect(page.getByText('From Knowledge Base · Class types')).toBeVisible();
  });
});

test.describe('/ — landing CTA navigates to /demo', () => {
  test('every "See how it works" button links to /demo', async ({ page }) => {
    await page.goto('/');
    const ctas = page.getByRole('link', { name: 'See how it works' });
    await expect(ctas).toHaveCount(2);
    const hrefs = await ctas.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute('href'))
    );
    for (const href of hrefs) {
      expect(href).toBe('/demo');
    }
  });
});

test.describe('/demo does not weaken existing route protection', () => {
  test('/dashboard/overview still redirects a signed-out visitor to /login', async ({ page }) => {
    const response = await page.goto('/dashboard/overview');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Foverview/);
  });

  test('/dashboard/agent still redirects a signed-out visitor to /login', async ({ page }) => {
    const response = await page.goto('/dashboard/agent');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fagent/);
  });
});
