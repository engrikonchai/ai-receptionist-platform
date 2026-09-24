import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import { DEFAULT_REDIRECT_PATH } from '@/lib/safe-redirect';
import { HeroSection } from '@/features/marketing/components/hero-section';
import { QuestionMarquee } from '@/features/marketing/components/question-marquee';
import { ExamplesSection } from '@/features/marketing/components/examples-section';
import { HowItWorksSection } from '@/features/marketing/components/how-it-works-section';
import { ControlSection } from '@/features/marketing/components/control-section';
import { FinalCtaSection } from '@/features/marketing/components/final-cta-section';

export const dynamic = 'force-dynamic';

/**
 * `/` used to unconditionally `redirect('/dashboard/overview')` for
 * every visitor, signed in or not — the dashboard's own layout (and
 * proxy.ts's optimistic fast path) then bounced a signed-out visitor
 * to `/login`. This preserves that exact behavior for an authenticated
 * visitor (any status other than 'unauthenticated' — dashboard/layout.tsx
 * still owns the onboarding-incomplete/multiple-business fallbacks from
 * there) while finally giving a signed-out visitor a real public page
 * instead of an immediate bounce to /login.
 */
export default async function LandingPage() {
  if (isSupabaseConfigured()) {
    const ctx = await loadOwnerContext();
    if (ctx.status !== 'unauthenticated') {
      redirect(DEFAULT_REDIRECT_PATH);
    }
  }

  return (
    <>
      <HeroSection />
      <QuestionMarquee />
      <ExamplesSection />
      <HowItWorksSection />
      <ControlSection />
      <FinalCtaSection />
    </>
  );
}
