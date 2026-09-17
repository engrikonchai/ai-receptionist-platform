import { cookies } from 'next/headers';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import {
  ACTIVE_BUSINESS_COOKIE,
  loadOwnerContext,
  resolveActiveBusinessId
} from '@/lib/supabase/owner-context';
import { BusinessProfileForm } from '@/features/onboarding/components/business-profile-form';
import {
  BUSINESS_TYPE_VALUES,
  LANGUAGE_VALUES,
  type BusinessType,
  type LanguageCode
} from '@/features/onboarding/schemas/onboarding';

function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPE_VALUES as readonly string[]).includes(value);
}

function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_VALUES as readonly string[]).includes(value);
}

export default async function SettingsPage() {
  const ctx = await loadOwnerContext();

  if (ctx.status !== 'ok') {
    return (
      <PlaceholderPage
        title='Settings'
        description='Configure your business and platform settings.'
      />
    );
  }

  const cookieStore = await cookies();
  const activeBusinessId = resolveActiveBusinessId(
    ctx.businesses,
    cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  );
  const activeBusiness = ctx.businesses.find((b) => b.id === activeBusinessId) ?? null;

  if (!activeBusiness) {
    return (
      <PlaceholderPage
        title='Settings'
        description='Configure your business and platform settings.'
      />
    );
  }

  return (
    <PageContainer
      pageTitle='Settings'
      pageDescription='Configure your business and platform settings.'
    >
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            businessId={activeBusiness.id}
            defaultValues={{
              businessName: activeBusiness.name,
              businessType: isBusinessType(activeBusiness.business_type)
                ? activeBusiness.business_type
                : 'other',
              location: activeBusiness.location ?? '',
              defaultLanguage: isLanguageCode(activeBusiness.default_language)
                ? activeBusiness.default_language
                : 'en',
              supportedLanguages: activeBusiness.supported_languages.filter(isLanguageCode).length
                ? activeBusiness.supported_languages.filter(isLanguageCode)
                : ['en']
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
