import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { loadOwnerContext } from '@/lib/supabase/owner-context';
import { DEFAULT_REDIRECT_PATH } from '@/lib/safe-redirect';
import { HeroSection } from '@/features/marketing/components/hero-section';
import { CapabilitiesSection } from '@/features/marketing/components/capabilities-section';
import { AnyBusinessSection } from '@/features/marketing/components/any-business-section';
import { HowItWorksSection } from '@/features/marketing/components/how-it-works-section';
import { TrustSection } from '@/features/marketing/components/trust-section';
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
      <CapabilitiesSection />
      <AnyBusinessSection />
      <HowItWorksSection />
      <TrustSection />
      <FinalCtaSection />
    </>
  );
}
