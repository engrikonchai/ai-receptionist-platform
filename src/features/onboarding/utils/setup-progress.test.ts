import { describe, expect, it } from 'vitest';
import {
  computeSetupProgress,
  MINIMUM_KNOWLEDGE_ITEMS,
  ONBOARDING_STEP,
  resolveOnboardingResumeStep,
  type SetupProgressBusinessInput,
  type SetupProgressWidgetInput
} from './setup-progress';

const completeBusiness: SetupProgressBusinessInput = {
  name: 'Riviera Stay Apartments',
  business_type: 'apartment',
  default_language: 'en',
  supported_languages: ['en']
};

const emptyBusiness: SetupProgressBusinessInput = {
  name: '',
  business_type: '',
  default_language: '',
  supported_languages: []
};

const completeWidget: SetupProgressWidgetInput = {
  widget_enabled: true,
  title: 'Adria Assistant',
  welcome_message_en: 'Hi! How can we help?',
  welcome_message_me: null,
  welcome_message_ru: null,
  allowed_origins: ['https://example.com'],
  installation_confirmed: true
};

const emptyWidget: SetupProgressWidgetInput = {
  widget_enabled: true,
  title: '',
  welcome_message_en: null,
  welcome_message_me: null,
  welcome_message_ru: null,
  allowed_origins: [],
  installation_confirmed: false
};

describe('computeSetupProgress', () => {
  it('reports all 5 items complete for a fully set-up business', () => {
    const progress = computeSetupProgress({
      business: completeBusiness,
      widget: completeWidget,
      activeKnowledgeItemCount: 3
    });

    expect(progress.completedCount).toBe(5);
    expect(progress.totalCount).toBe(5);
    expect(progress.isComplete).toBe(true);
    expect(progress.items.every((item) => item.completed)).toBe(true);
  });

  it('reports 0 of 5 for a brand-new, untouched business', () => {
    const progress = computeSetupProgress({
      business: emptyBusiness,
      widget: emptyWidget,
      activeKnowledgeItemCount: 0
    });

    expect(progress.completedCount).toBe(0);
    expect(progress.isComplete).toBe(false);
  });

  it('shows "3 of 5" style partial progress and identifies exactly which items are done', () => {
    const progress = computeSetupProgress({
      business: completeBusiness,
      widget: { ...completeWidget, allowed_origins: [], installation_confirmed: false },
      activeKnowledgeItemCount: 2
    });

    expect(progress.completedCount).toBe(3);
    expect(progress.totalCount).toBe(5);
    const byId = Object.fromEntries(progress.items.map((item) => [item.id, item.completed]));
    expect(byId).toEqual({
      businessProfile: true,
      knowledgeBase: true,
      widgetConfigured: true,
      websiteOrigin: false,
      installationConfirmed: false
    });
  });

  it('requires the widget to be enabled, not just named, for "widget configured"', () => {
    const progress = computeSetupProgress({
      business: completeBusiness,
      widget: { ...completeWidget, widget_enabled: false },
      activeKnowledgeItemCount: 1
    });

    const widgetItem = progress.items.find((item) => item.id === 'widgetConfigured');
    expect(widgetItem?.completed).toBe(false);
  });

  it('requires the default-language welcome message specifically, not just any language', () => {
    const progress = computeSetupProgress({
      business: { ...completeBusiness, default_language: 'me' },
      widget: { ...completeWidget, welcome_message_en: 'Hi!', welcome_message_me: null },
      activeKnowledgeItemCount: 1
    });

    const widgetItem = progress.items.find((item) => item.id === 'widgetConfigured');
    expect(widgetItem?.completed).toBe(false);
  });

  it('keeps two businesses’ completion states fully independent — active-business isolation', () => {
    // Simulates an owner with two businesses: their first one fully set
    // up, their second one untouched. Each call only ever sees the
    // data explicitly passed for that one business — nothing carries
    // over between calls (the function is pure and stateless), which is
    // what lets the Overview page compute a fresh, correct result for
    // whichever business is currently active without ever mixing the
    // two up.
    const firstBusinessProgress = computeSetupProgress({
      business: completeBusiness,
      widget: completeWidget,
      activeKnowledgeItemCount: 5
    });
    const secondBusinessProgress = computeSetupProgress({
      business: { ...emptyBusiness, name: 'Second Business', business_type: 'hotel' },
      widget: emptyWidget,
      activeKnowledgeItemCount: 0
    });

    expect(firstBusinessProgress.isComplete).toBe(true);
    expect(firstBusinessProgress.completedCount).toBe(5);
    expect(secondBusinessProgress.isComplete).toBe(false);
    expect(secondBusinessProgress.completedCount).toBe(0);

    // Recomputing the first business again afterward is unaffected by
    // having just computed the second one.
    const firstBusinessAgain = computeSetupProgress({
      business: completeBusiness,
      widget: completeWidget,
      activeKnowledgeItemCount: 5
    });
    expect(firstBusinessAgain).toEqual(firstBusinessProgress);
  });

  it('treats a single active knowledge item as enough for "at least one"', () => {
    const progress = computeSetupProgress({
      business: completeBusiness,
      widget: completeWidget,
      activeKnowledgeItemCount: 1
    });

    const knowledgeItem = progress.items.find((item) => item.id === 'knowledgeBase');
    expect(knowledgeItem?.completed).toBe(true);
  });

  it('links each item to the correct dashboard page', () => {
    const progress = computeSetupProgress({
      business: emptyBusiness,
      widget: emptyWidget,
      activeKnowledgeItemCount: 0
    });

    const hrefById = Object.fromEntries(progress.items.map((item) => [item.id, item.href]));
    expect(hrefById).toEqual({
      businessProfile: '/dashboard/settings',
      knowledgeBase: '/dashboard/knowledge',
      widgetConfigured: '/dashboard/widget',
      websiteOrigin: '/dashboard/widget',
      installationConfirmed: '/dashboard/widget'
    });
  });
});

describe('resolveOnboardingResumeStep', () => {
  it('starts a brand-new owner at the business info step, even though placeholder business fields are already non-empty', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: 0,
      widget: emptyWidget,
      onboardingCompleted: false
    });

    expect(step).toBe(ONBOARDING_STEP.business);
  });

  it('resumes at the knowledge step once the owner has added an origin but fewer than the minimum knowledge items', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: 1,
      widget: { ...emptyWidget, allowed_origins: ['https://example.com'] },
      onboardingCompleted: false
    });

    expect(step).toBe(ONBOARDING_STEP.knowledge);
    expect(1).toBeLessThan(MINIMUM_KNOWLEDGE_ITEMS);
  });

  it('resumes at the website connection step once knowledge is satisfied but no origin is allow-listed', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: MINIMUM_KNOWLEDGE_ITEMS,
      widget: { ...emptyWidget, installation_confirmed: true },
      onboardingCompleted: false
    });

    expect(step).toBe(ONBOARDING_STEP.websiteConnection);
  });

  it('resumes at the completion step once knowledge and an origin are both present but onboarding was never marked complete', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: MINIMUM_KNOWLEDGE_ITEMS,
      widget: { ...emptyWidget, allowed_origins: ['https://example.com'] },
      onboardingCompleted: false
    });

    expect(step).toBe(ONBOARDING_STEP.completion);
  });

  it('resolves to the completion step for an already-completed owner without re-checking anything else', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: 0,
      widget: emptyWidget,
      onboardingCompleted: true
    });

    expect(step).toBe(ONBOARDING_STEP.completion);
  });

  it('treats installation_confirmed alone (no knowledge, no origin) as progress beyond the business step', () => {
    const step = resolveOnboardingResumeStep({
      activeKnowledgeItemCount: 0,
      widget: { ...emptyWidget, installation_confirmed: true },
      onboardingCompleted: false
    });

    expect(step).toBe(ONBOARDING_STEP.knowledge);
  });
});
