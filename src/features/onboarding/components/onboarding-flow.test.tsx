// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingFlow, type OnboardingDefaults } from './onboarding-flow';
import { ONBOARDING_STEP } from '../utils/setup-progress';
import type { OnboardingActionResult } from '../api/types';
import type { WidgetActionResult } from '@/features/widget/api/types';
import type { KnowledgeItem } from '@/features/knowledge/api/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push })
}));

const saveBusinessInfoFn = vi.fn<(input: unknown) => Promise<OnboardingActionResult>>();
const markCompleteFn = vi.fn<() => Promise<OnboardingActionResult>>();
vi.mock('../api/queries', () => ({
  saveBusinessInfoStepMutation: () => ({ mutationFn: saveBusinessInfoFn }),
  markOnboardingCompletedMutation: () => ({ mutationFn: markCompleteFn })
}));

const saveWidgetFn = vi.fn<(input: unknown) => Promise<WidgetActionResult>>();
const confirmInstallFn = vi.fn<() => Promise<WidgetActionResult>>();
vi.mock('@/features/widget/api/queries', () => ({
  saveWidgetSettingsMutation: () => ({ mutationFn: saveWidgetFn }),
  confirmWidgetInstallationMutation: () => ({ mutationFn: confirmInstallFn })
}));

let knowledgeItems: KnowledgeItem[] = [];
const createKnowledgeItemFn = vi.fn(async (input: Partial<KnowledgeItem>) => {
  const item: KnowledgeItem = {
    id: `item-${knowledgeItems.length + 1}`,
    category: input.category ?? 'General',
    question: input.question ?? '',
    answerEn: input.answerEn ?? '',
    answerMe: input.answerMe ?? '',
    answerRu: input.answerRu ?? '',
    isActive: true,
    sortOrder: knowledgeItems.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  knowledgeItems = [...knowledgeItems, item];
  return { success: true, item };
});
vi.mock('@/features/knowledge/api/queries', () => ({
  knowledgeKeys: { items: (businessId: string) => ['knowledge', businessId, 'items'] },
  knowledgeItemsOptions: (businessId: string) => ({
    queryKey: ['knowledge', businessId, 'items'],
    queryFn: () => Promise.resolve(knowledgeItems)
  }),
  createKnowledgeItemMutation: () => ({ mutationFn: createKnowledgeItemFn })
}));

const defaultValues: OnboardingDefaults = {
  businessName: 'Riviera Stay Apartments',
  businessType: 'apartment',
  location: 'Budva, Montenegro',
  websiteUrl: '',
  defaultLanguage: 'en',
  supportedLanguages: ['en'],
  assistantName: 'Adria Assistant',
  welcomeMessage: 'Hi! How can we help?',
  primaryColor: '#1677ff',
  position: 'bottom-right',
  humanHandoffEnabled: false,
  handoffEmail: '',
  allowedOrigins: []
};

function renderFlow(overrides: Partial<Parameters<typeof OnboardingFlow>[0]> = {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingFlow
        businessId='biz-1'
        publicWidgetId='11111111-1111-4111-8111-111111111111'
        siteOrigin='https://platform.example'
        installationConfirmedAt={null}
        defaultValues={defaultValues}
        initialStep={ONBOARDING_STEP.business}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  knowledgeItems = [];
  saveBusinessInfoFn.mockReset().mockResolvedValue({ success: true });
  markCompleteFn.mockReset().mockResolvedValue({ success: true });
  saveWidgetFn.mockReset().mockResolvedValue({ success: true });
  confirmInstallFn.mockReset().mockResolvedValue({ success: true });
  createKnowledgeItemFn.mockClear();
  push.mockReset();
});

describe('OnboardingFlow — brand-new owner', () => {
  it('starts at the business information step', () => {
    renderFlow();

    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your business' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Business name/)).toBeInTheDocument();
  });

  it('saves business info and advances to the Knowledge step on Continue', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    await waitFor(() => expect(saveBusinessInfoFn).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Initial knowledge' })).toBeInTheDocument();
  });

  it('disables the Continue button while the business info save is pending — duplicate-submit protection', async () => {
    let resolveMutation!: (result: OnboardingActionResult) => void;
    saveBusinessInfoFn.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      })
    );
    const user = userEvent.setup();
    renderFlow();

    const continueButton = screen.getByRole('button', { name: /Continue/ });
    await user.click(continueButton);

    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    expect(saveBusinessInfoFn).toHaveBeenCalledTimes(1);

    // A second click while pending must not fire a second save.
    await user.click(screen.getByRole('button', { name: /Saving/ }));
    expect(saveBusinessInfoFn).toHaveBeenCalledTimes(1);

    resolveMutation({ success: true });
    await waitFor(() => expect(screen.getByText('Step 2 of 5')).toBeInTheDocument());
  });

  it('shows the server error and stays on step 1 when saving business info fails', async () => {
    saveBusinessInfoFn.mockResolvedValue({ success: false, error: 'Something went wrong.' });
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });
});

describe('OnboardingFlow — Knowledge step', () => {
  it('gates Continue until at least 3 active items are added, but always allows Skip', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.knowledge });

    expect(screen.getByText('0 of 3 suggested added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

    for (const [question, answer] of [
      ['What time is check-in?', 'Check-in is from 3 PM.'],
      ['Is parking available?', 'Yes, free parking on site.'],
      ['Do you allow pets?', 'Small pets are welcome.']
    ]) {
      await user.type(screen.getByLabelText('Question'), question);
      await user.type(screen.getByLabelText('Answer'), answer);
      await user.click(screen.getByRole('button', { name: 'Add question' }));
      await waitFor(() => expect(screen.getByLabelText('Question')).toHaveValue(''));
    }

    await waitFor(() => expect(screen.getByText('3 of 3 suggested added')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(createKnowledgeItemFn).toHaveBeenCalledTimes(3);
  });

  it('requires a second confirmation before skipping, with a clear warning', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.knowledge });

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(screen.getByText('Skip adding knowledge for now?')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument(); // hasn't advanced yet

    await user.click(screen.getByRole('button', { name: 'Yes, skip for now' }));

    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
  });

  it('cancels the skip warning without advancing', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.knowledge });

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Skip adding knowledge for now?')).not.toBeInTheDocument();
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
  });
});

describe('OnboardingFlow — Website connection step', () => {
  it('lets the owner skip installation and return later', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.websiteConnection });

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => expect(saveWidgetFn).toHaveBeenCalledTimes(1));
    const payload = saveWidgetFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.allowedOrigins).toEqual([]);
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
  });

  it('explains that an origin includes https:// and cannot contain a path', () => {
    renderFlow({ initialStep: ONBOARDING_STEP.websiteConnection });

    expect(screen.getByText(/Include https:\/\/ and no path/)).toBeInTheDocument();
  });

  it('shows the Copy button for the installation snippet', () => {
    renderFlow({ initialStep: ONBOARDING_STEP.websiteConnection });

    expect(screen.getByRole('button', { name: /Copy code/ })).toBeInTheDocument();
  });
});

describe('OnboardingFlow — Completion step', () => {
  it('marks onboarding complete on arrival and shows a clear success screen', async () => {
    renderFlow({ initialStep: ONBOARDING_STEP.completion });

    expect(screen.getByRole('heading', { name: "You're all set" })).toBeInTheDocument();
    expect(screen.getByText('Your AI receptionist is ready')).toBeInTheDocument();
    await waitFor(() => expect(markCompleteFn).toHaveBeenCalled());
  });

  it('routes to the dashboard when the owner clicks "Go to dashboard"', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.completion });

    await user.click(screen.getByRole('button', { name: /Go to dashboard/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/overview'));
  });

  it('is idempotent — re-entering the completion step again never errors', async () => {
    const { unmount } = renderFlow({ initialStep: ONBOARDING_STEP.completion });
    await waitFor(() => expect(markCompleteFn).toHaveBeenCalledTimes(1));
    unmount();

    renderFlow({ initialStep: ONBOARDING_STEP.completion });
    await waitFor(() => expect(markCompleteFn).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('heading', { name: "You're all set" })).toBeInTheDocument();
  });
});

describe('OnboardingFlow — interrupted onboarding and resume', () => {
  it('resumes directly at the resolved step without re-showing earlier steps', () => {
    renderFlow({ initialStep: ONBOARDING_STEP.widgetAppearance });

    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Widget appearance' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Business name/)).not.toBeInTheDocument();
  });

  it('lets the owner go Back from a resumed step', async () => {
    const user = userEvent.setup();
    renderFlow({ initialStep: ONBOARDING_STEP.widgetAppearance });

    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
  });
});
